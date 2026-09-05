import { isSupabaseConfigured, supabase } from "./supabaseClient.js";

const schema = () => supabase?.schema("boy_central");

export async function getBoyCentralAuthState() {
  if (!isSupabaseConfigured || !supabase) return { configured: false, user: null };
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  return { configured: true, user: data.session?.user || null };
}

export async function ensureBoyCentralDeviceSession() {
  if (!isSupabaseConfigured || !supabase) return { configured: false, user: null };
  const current = await getBoyCentralAuthState();
  if (current.user) return current;
  const { data, error } = await supabase.auth.signInAnonymously();
  if (error) throw error;
  return { configured: true, user: data.user || data.session?.user || null };
}

export function onBoyCentralAuthChange(callback) {
  if (!supabase) return () => {};
  const { data } = supabase.auth.onAuthStateChange((_event, session) => callback(session?.user || null));
  return () => data.subscription.unsubscribe();
}

export async function stageBoyCentralMaster({ ingredients, products }) {
  const context = await getBurgerContext();
  const { data, error } = await schema().rpc("stage_pos_master_snapshot", {
    payload: {
      branch_id: context.branch_id,
      source_system: "burger_pos_app_state",
      ingredients: ingredients || [],
      products: products || [],
    },
  });
  if (error) throw error;
  return data;
}

export async function getBoyCentralSyncState() {
  const auth = await ensureBoyCentralDeviceSession();
  if (!auth.user) throw new Error("เครื่อง POS ยังเชื่อม BOY Central ไม่สำเร็จ");
  const { data, error } = await schema().rpc("get_burger_pos_sync_state");
  if (error) throw error;
  return data || { stock: [], synced_order_external_ids: [] };
}

export function mergeBoyCentralStock(ingredients, snapshot) {
  const stockByLegacyKey = new Map(
    (snapshot?.stock || []).map((row) => [String(row.legacy_key), row]),
  );
  return (ingredients || []).map((ingredient) => {
    const central = stockByLegacyKey.get(String(ingredient.id));
    if (!central) return ingredient;
    const nextStock = Number(central.quantity_on_hand || 0);
    if (Number(ingredient.stock || 0) === nextStock) return ingredient;
    return {
      ...ingredient,
      stock: nextStock,
      centralItemId: central.item_id,
      centralSyncedAt: snapshot.server_time || new Date().toISOString(),
    };
  });
}

export async function backfillBoyCentralOrders(orders, snapshot, onProgress = () => {}) {
  const synced = new Set(snapshot?.synced_order_external_ids || []);
  const pending = (orders || [])
    .filter((order) => order?.id && !order.isTest && !synced.has(order.id))
    .sort((left, right) => new Date(left.createdAt || 0) - new Date(right.createdAt || 0));
  let completed = 0;
  for (const order of pending) {
    await sendBoyCentralJob(makeBoyCentralOrderJob(order, []));
    if (order.voidedAt) await sendBoyCentralJob(makeBoyCentralVoidJob(order));
    completed += 1;
    onProgress({ completed, total: pending.length });
  }
  return { completed, total: pending.length };
}

export function makeBoyCentralOrderJob(order, movements = []) {
  return {
    id: `CENTRAL-ORDER-${order.id}`,
    type: "ORDER",
    sourceId: order.id,
    order,
    movements,
    description: `${order.orderNo || order.id} -> BOY Central`,
  };
}

export function makeBoyCentralVoidJob(order) {
  return {
    id: `CENTRAL-VOID-${order.id}`,
    type: "ORDER_VOID",
    sourceId: order.id,
    order,
    description: `${order.orderNo || order.id} void -> BOY Central`,
  };
}

export async function sendBoyCentralJob(job) {
  const auth = await ensureBoyCentralDeviceSession();
  if (!auth.user) throw new Error("เครื่อง POS ยังเชื่อม BOY Central ไม่สำเร็จ");
  const context = await getBurgerContext();
  if (job.type === "ORDER") return sendOrder(job, context);
  if (job.type === "ORDER_VOID") return sendVoid(job, context);
  throw new Error(`ไม่รู้จักคิว BOY Central: ${job.type}`);
}

async function getBurgerContext() {
  const { data, error } = await schema().rpc("get_burger_pos_context");
  if (error) throw error;
  return data;
}

async function sendOrder(job, context) {
  const order = job.order || {};
  const mappings = context.mappings || [];
  const menuByLegacyKey = new Map(
    mappings.filter((entry) => entry.entity_type === "product" && entry.match_status === "matched" && entry.menu_id)
      .map((entry) => [entry.legacy_key, entry.menu_id]),
  );
  const itemByLegacyKey = new Map(
    mappings.filter((entry) => entry.entity_type === "ingredient" && entry.match_status === "matched" && entry.item_id)
      .map((entry) => [entry.legacy_key, entry.item_id]),
  );
  const payload = {
    branch_id: context.branch_id,
    source_system: "burger_pos_app_state",
    external_id: order.id,
    idempotency_key: `burger-pos:order:${order.id}`,
    order_no: `BURGER-${order.id}`,
    ordered_at: order.createdAt,
    shift_external_id: order.shiftId || null,
    sales_channel: order.salesChannel || "store",
    payment_method: order.paymentMethod || "OTHER",
    subtotal: Number(order.totalAmount || 0),
    discount: 0,
    total_amount: Number(order.totalAmount || 0),
    note: order.note || null,
    lines: (order.items || []).map((line, index) => ({
      external_id: `${order.id}:${index + 1}`,
      menu_id: menuByLegacyKey.get(line.productId) || null,
      item_name: line.name,
      quantity: Number(line.quantity || 1),
      unit_price: Number(line.unitPrice || 0),
      line_total: Number(line.quantity || 1) * Number(line.unitPrice || 0),
      note: line.note || null,
      modifiers: (line.modifiers || []).map((name, modifierIndex) => ({
        external_id: `${order.id}:${index + 1}:mod:${line.modifierIds?.[modifierIndex] || modifierIndex + 1}`,
        name,
        quantity: 1,
        price_delta: 0,
      })),
    })),
    stock_movements: (job.movements || []).flatMap((movement) => {
      const itemId = itemByLegacyKey.get(movement.ingredientId);
      if (!itemId) return [];
      return [{
        external_id: movement.id,
        item_id: itemId,
        quantity_delta: Number(movement.quantityDelta || 0),
        reason: movement.reason || "ตัดสต็อกจาก Burger POS",
      }];
    }),
  };
  const { data, error } = await schema().rpc("ingest_pos_order", { payload });
  if (error) throw error;
  return data;
}

async function sendVoid(job) {
  const order = job.order || {};
  const payload = {
    source_system: "burger_pos_app_state",
    external_id: order.id,
    idempotency_key: `burger-pos:void:${order.id}`,
    voided_at: order.voidedAt || new Date().toISOString(),
    void_reason: order.voidReason || "ยกเลิกออเดอร์จาก Burger POS",
    refund_method: order.voidRefundMethod || "NONE",
    refund_amount: Number(order.voidRefundAmount || 0),
  };
  const { data, error } = await schema().rpc("ingest_pos_void", { payload });
  if (error) throw error;
  return data;
}
