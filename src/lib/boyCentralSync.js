import { isSupabaseConfigured, supabase } from "./supabaseClient.js";

const DEVICE_TOKEN_KEY = "boy-burger-central-device-token";
const DEVICE_ID_KEY = "boy-burger-central-device-id";
const DEVICE_CODE_KEY = "boy-burger-central-device-code";
const DEFAULT_DEVICE_CODE = "BURGER-POS-01";
const APP_VERSION = "1.6";
const CENTRAL_STOCK_NAME_ALIASES = {
  "ขนมปังเบอร์เกอร์": "ขนมปัง",
  ชีส: "ชีส Allowrie",
  เนื้อกุ้ง: "เนื้อกุ้ง Ramly 65 กรัม",
  เนื้อไก่: "เนื้อไก่ Ramly 60 กรัม",
  เนื้อปลา: "เนื้อปลา Ramly 65 กรัม",
  เนื้อวัว: "เนื้อวัว Ramly 60 กรัม",
};

function makeCentralOrderNo(order) {
  const externalId = String(order?.id || "").replace(/^ORD-/, "");
  return `BG-${externalId || Date.now()}`;
}

function readLocal(key) {
  if (typeof window === "undefined") return "";
  return window.localStorage.getItem(key) || "";
}

function writeLocal(key, value) {
  if (typeof window === "undefined") return;
  if (value) window.localStorage.setItem(key, value);
  else window.localStorage.removeItem(key);
}

export function getBoyCentralDeviceRegistration() {
  return {
    deviceToken: readLocal(DEVICE_TOKEN_KEY),
    deviceId: readLocal(DEVICE_ID_KEY),
    deviceCode: readLocal(DEVICE_CODE_KEY) || DEFAULT_DEVICE_CODE,
  };
}

export async function getBoyCentralAuthState() {
  if (!isSupabaseConfigured || !supabase) return { configured: false, user: null };
  const registration = getBoyCentralDeviceRegistration();
  return {
    configured: true,
    user: registration.deviceToken ? { id: registration.deviceId || registration.deviceCode, ...registration } : null,
  };
}

export async function ensureBoyCentralDeviceSession() {
  if (!isSupabaseConfigured || !supabase) return { configured: false, user: null };
  const registration = getBoyCentralDeviceRegistration();
  if (!registration.deviceToken) throw new Error("ยังไม่ได้จับคู่เครื่อง POS กับ BOY Central");
  return {
    configured: true,
    user: { id: registration.deviceId || registration.deviceCode, ...registration },
  };
}

export function onBoyCentralAuthChange(callback) {
  void getBoyCentralAuthState().then((state) => callback(state.user));
  return () => {};
}

export async function claimBoyCentralDevice({ pairingCode, deviceCode = DEFAULT_DEVICE_CODE, deviceName = "Burger POS เครื่อง 1" }) {
  if (!isSupabaseConfigured || !supabase) throw new Error("ยังไม่ได้ตั้งค่า Supabase");
  const normalizedCode = String(pairingCode || "").trim();
  if (!/^\d{8}$/.test(normalizedCode)) throw new Error("กรุณากรอกรหัสจับคู่ 8 หลัก");
  const normalizedDeviceCode = String(deviceCode || DEFAULT_DEVICE_CODE).trim() || DEFAULT_DEVICE_CODE;
  const { data, error } = await supabase.rpc("pos_claim_device", {
    target_branch_code: "BURGER",
    target_device_code: normalizedDeviceCode,
    pairing_code: normalizedCode,
  });
  if (error) throw error;
  if (!data?.device_token) throw new Error("จับคู่เครื่องไม่สำเร็จ");
  writeLocal(DEVICE_TOKEN_KEY, data.device_token);
  writeLocal(DEVICE_ID_KEY, data.device_id || "");
  writeLocal(DEVICE_CODE_KEY, normalizedDeviceCode);
  return { id: data.device_id, deviceCode: normalizedDeviceCode, deviceName };
}

export async function getBoyCentralSyncState() {
  const auth = await ensureBoyCentralDeviceSession();
  if (!auth.user) throw new Error("เครื่อง POS ยังเชื่อม BOY Central ไม่สำเร็จ");
  const { data, error } = await supabase.rpc("pos_device_bootstrap", {
    device_token: auth.user.deviceToken,
  });
  if (error) throw error;
  return {
    ...(data || {}),
    stock: (data?.inventory || []).map((item) => ({
      legacy_key: null,
      item_id: item.central_item_id,
      item_name: item.name,
      quantity_on_hand: item.quantity,
      unit_name: item.unit,
    })),
    synced_order_external_ids: [],
  };
}

export function mergeBoyCentralMaster(ingredients, recipes, modifierRecipes = [], snapshot = {}) {
  const mappings = Array.isArray(snapshot?.ingredient_mappings) ? snapshot.ingredient_mappings : [];
  const mappingByLegacyKey = new Map(mappings.map((row) => [String(row.legacy_key), row]));
  const nextIngredients = (ingredients || []).map((ingredient) => {
    const mapping = mappingByLegacyKey.get(String(ingredient.id));
    if (!mapping?.central_item_id) return ingredient;
    return {
      ...ingredient,
      name: mapping.central_item_name || ingredient.name,
      unit: mapping.unit || ingredient.unit,
      centralItemId: mapping.central_item_id,
      centralItemName: mapping.central_item_name || ingredient.centralItemName || ingredient.name,
      centralMasterVersion: snapshot.master_version || null,
    };
  });

  const centralRows = Array.isArray(snapshot?.recipes) ? snapshot.recipes : [];
  const mappedProductIds = new Set((snapshot?.product_mappings || []).map((row) => String(row.legacy_key)));
  centralRows.forEach((row) => mappedProductIds.add(String(row.product_id)));
  const centralModifierRows = Array.isArray(snapshot?.modifier_recipes) ? snapshot.modifier_recipes : [];
  const mappedModifierIds = new Set((snapshot?.modifier_mappings || []).map((row) => String(row.legacy_key)));
  centralModifierRows.forEach((row) => mappedModifierIds.add(String(row.modifier_id)));
  const nextModifierRecipes = (modifierRecipes || []).filter((recipe) => !mappedModifierIds.has(String(recipe.modifierId)));
  centralModifierRows.forEach((row) => {
    if (!row.modifier_id || !row.ingredient_id || Number(row.quantity || 0) === 0) return;
    nextModifierRecipes.push({
      modifierId: String(row.modifier_id),
      ingredientId: String(row.ingredient_id),
      quantity: Number(row.quantity),
      centralItemId: row.central_item_id || null,
      centralMasterVersion: snapshot.master_version || null,
    });
  });
  if (!mappedProductIds.size) return { ingredients: nextIngredients, recipes, modifierRecipes: nextModifierRecipes };
  const nextRecipes = (recipes || []).filter((recipe) => !mappedProductIds.has(String(recipe.productId)));
  centralRows.forEach((row) => {
    if (!row.product_id || !row.ingredient_id || Number(row.quantity || 0) <= 0) return;
    nextRecipes.push({
      productId: String(row.product_id),
      ingredientId: String(row.ingredient_id),
      quantity: Number(row.quantity),
      centralItemId: row.central_item_id || null,
      centralMasterVersion: snapshot.master_version || null,
    });
  });
  return { ingredients: nextIngredients, recipes: nextRecipes, modifierRecipes: nextModifierRecipes };
}

export function mergeBoyCentralStock(ingredients, snapshot) {
  const stockByLegacyKey = new Map(
    (snapshot?.stock || []).filter((row) => row.legacy_key).map((row) => [String(row.legacy_key), row]),
  );
  const stockByCentralId = new Map((snapshot?.stock || []).filter((row) => row.item_id).map((row) => [String(row.item_id), row]));
  const stockByName = new Map((snapshot?.stock || []).filter((row) => row.item_name).map((row) => [String(row.item_name).trim(), row]));
  return (ingredients || []).map((ingredient) => {
    const ingredientName = String(ingredient.name || "").trim();
    const central = stockByLegacyKey.get(String(ingredient.id))
      || stockByCentralId.get(String(ingredient.centralItemId || ""))
      || stockByName.get(CENTRAL_STOCK_NAME_ALIASES[ingredientName] || ingredientName);
    if (!central) return ingredient;
    const nextStock = Number(central.quantity_on_hand || 0);
    const nextUnit = central.unit_name || ingredient.unit;
    if (
      Number(ingredient.stock || 0) === nextStock
      && ingredient.centralItemId === central.item_id
      && ingredient.unit === nextUnit
      && ingredient.centralItemName === central.item_name
    ) return ingredient;
    return {
      ...ingredient,
      stock: nextStock,
      unit: nextUnit,
      centralItemId: central.item_id,
      centralItemName: central.item_name,
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

export function makeBoyCentralVoidJob(order, movements = []) {
  return {
    id: `CENTRAL-VOID-${order.id}`,
    type: "ORDER_VOID",
    sourceId: order.id,
    order,
    movements,
    description: `${order.orderNo || order.id} void -> BOY Central`,
  };
}

export async function sendBoyCentralJob(job) {
  const auth = await ensureBoyCentralDeviceSession();
  if (!auth.user) throw new Error("เครื่อง POS ยังเชื่อม BOY Central ไม่สำเร็จ");
  if (job.type === "ORDER") return sendOrder(job);
  if (job.type === "ORDER_VOID") return sendVoid(job);
  throw new Error(`ไม่รู้จักคิว BOY Central: ${job.type}`);
}

export async function saveBoyCentralRecipe(productId, lines) {
  const auth = await ensureBoyCentralDeviceSession();
  const { data, error } = await supabase.rpc("pos_save_recipe", {
    device_token: auth.user.deviceToken,
    payload: {
      product_id: String(productId),
      lines: (lines || []).map((line) => ({
        ingredient_id: String(line.ingredientId),
        quantity: Number(line.quantity),
      })),
    },
  });
  if (error) throw error;
  return data;
}

export async function saveBoyCentralModifierRecipe(modifier, lines) {
  const auth = await ensureBoyCentralDeviceSession();
  const { data, error } = await supabase.rpc("pos_save_modifier_recipe", {
    device_token: auth.user.deviceToken,
    payload: {
      modifier_id: String(modifier.id),
      modifier_label: modifier.label || String(modifier.id),
      modifier,
      lines: (lines || []).map((line) => ({
        ingredient_id: String(line.ingredientId),
        quantity: Number(line.quantity),
      })),
    },
  });
  if (error) throw error;
  return data;
}

async function sendOrder(job) {
  const order = job.order || {};
  const stockMovements = (job.movements || []).map((movement) => ({
    central_item_id: movement.centralItemId || null,
    legacy_ingredient_id: movement.ingredientId || null,
    name: movement.ingredientName || null,
    quantity_delta: Number(movement.quantityDelta || 0),
  }));
  const auth = await ensureBoyCentralDeviceSession();
  const payment = order.paymentMethod === "CASH"
    ? "cash"
    : order.paymentMethod === "TRANSFER"
      ? "transfer"
      : order.paymentMethod === "THAI_CHUAY_THAI"
        ? "government"
        : "other";
  const event = {
    event_type: "ORDER",
    source_system: "burger_pos",
    external_id: order.id,
    occurred_at: order.createdAt,
    app_version: APP_VERSION,
    data: {
      id: order.id,
      shiftId: order.shiftId || null,
      orderNo: makeCentralOrderNo(order),
      displayOrderNo: order.orderNo || order.id,
      payment,
      paymentMethod: order.paymentMethod || "OTHER",
      salesChannel: order.salesChannel || "store",
      subtotal: Number(order.totalAmount || 0),
      discount: Number(order.discountAmount || 0),
      vatAmount: Number(order.vatAmount || 0),
      total: Number(order.totalAmount || 0),
      cashReceived: Number(order.cashReceived || 0),
      changeDue: Number(order.changeDue || 0),
      note: order.note || null,
      items: (order.items || []).map((line, index) => ({
        id: `${order.id}:${index + 1}`,
        productId: line.productId || null,
        name: line.name,
        qty: Number(line.quantity || 1),
        total: Number(line.quantity || 1) * Number(line.unitPrice || 0),
        note: [line.note, ...(line.modifiers || [])].filter(Boolean).join(" · ") || null,
      })),
    },
    stock_deltas: stockMovements,
  };
  const { data, error } = await supabase.rpc("pos_sync_event", {
    device_token: auth.user.deviceToken,
    event,
  });
  if (error) throw error;
  return data;
}

async function sendVoid(job) {
  const order = job.order || {};
  const payload = {
    app_version: APP_VERSION,
    source_system: "burger_pos_app_state",
    external_id: order.id,
    idempotency_key: `burger-pos:void:${order.id}`,
    voided_at: order.voidedAt || new Date().toISOString(),
    void_reason: order.voidReason || "ยกเลิกออเดอร์จาก Burger POS",
    refund_method: order.voidRefundMethod || "NONE",
    refund_amount: Number(order.voidRefundAmount || 0),
  };
  const auth = await ensureBoyCentralDeviceSession();
  const event = {
    event_type: "VOID",
    external_id: order.id,
    occurred_at: payload.voided_at,
    app_version: APP_VERSION,
    data: {
      id: order.id,
      voidReason: payload.void_reason,
      refundMethod: payload.refund_method,
      refundAmount: payload.refund_amount,
    },
  };
  const { data, error } = await supabase.rpc("pos_sync_event", {
    device_token: auth.user.deviceToken,
    event,
  });
  if (error) throw error;
  const stockMovements = (job.movements || []).map((movement) => ({
    central_item_id: movement.centralItemId || null,
    legacy_ingredient_id: movement.ingredientId || null,
    name: movement.ingredientName || null,
    quantity_delta: Number(movement.quantityDelta || 0),
  })).filter((movement) => movement.quantity_delta !== 0);
  if (!stockMovements.length) return data;
  const { data: stockData, error: stockError } = await supabase.rpc("pos_sync_event", {
    device_token: auth.user.deviceToken,
    event: {
      event_type: "STOCK_ADJUST",
      source_system: "burger_pos",
      external_id: `${order.id}:void-stock`,
      occurred_at: payload.voided_at,
      app_version: APP_VERSION,
      reason: `คืนสต็อกจากการยกเลิก ${order.orderNo || order.id}`,
      stock_deltas: stockMovements,
    },
  });
  if (stockError) throw stockError;
  return { void: data, stock: stockData };
}
