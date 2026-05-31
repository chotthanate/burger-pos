export const BURGER_POS_SHEET_ID = "1-JJ9u2NjqBrQtgrBb4sUsmwdV36GP25g-rJPrwv8mpI";

export const SHEET_TABS = {
  sales: "Sales",
  expenses: "Expenses",
  stockMovements: "Stock Movements",
  shiftSummary: "Shift Summary",
  auditLog: "Audit Log",
};

export const SHEET_HEADERS = {
  [SHEET_TABS.sales]: [
    "order_id",
    "order_no",
    "created_at",
    "date",
    "time",
    "sales_channel",
    "payment_method",
    "total_amount",
    "cash_received",
    "change_due",
    "shift_id",
    "product_id",
    "product_name",
    "quantity",
    "unit_price",
    "line_total",
    "modifiers",
    "item_note",
    "order_status",
    "voided_at",
    "void_reason",
    "refund_method",
    "refund_amount",
    "stock_restored",
  ],
  [SHEET_TABS.expenses]: [
    "expense_id",
    "expense_date",
    "created_at",
    "ingredient_id",
    "item_name",
    "ingredient_name",
    "purchase_unit",
    "base_unit",
    "quantity",
    "unit_price",
    "line_total",
    "stock_quantity",
    "category",
    "subcategory",
    "note",
    "total_amount",
  ],
  [SHEET_TABS.stockMovements]: [
    "created_at",
    "date",
    "time",
    "type",
    "ingredient_id",
    "ingredient_name",
    "quantity_before",
    "quantity_delta",
    "quantity_after",
    "unit",
    "source_type",
    "source_id",
    "reason",
  ],
  [SHEET_TABS.shiftSummary]: [
    "shift_id",
    "opened_at",
    "closed_at",
    "opening_cash",
    "cash_sales",
    "transfer_sales",
    "total_sales",
    "expected_cash",
    "closing_cash",
    "cash_difference",
    "order_count",
    "gross_sales",
    "void_order_count",
    "void_amount",
    "cash_refund_amount",
    "transfer_refund_amount",
    "net_sales",
  ],
  [SHEET_TABS.auditLog]: [
    "created_at",
    "date",
    "time",
    "event_type",
    "source_type",
    "source_id",
    "item_id",
    "item_name",
    "before_value",
    "change_value",
    "after_value",
    "amount",
    "reason",
    "raw_json",
  ],
};

export function makeOrderSheetJob(order, movements = []) {
  const syncId = `SYNC-ORDER-${order.id}-${Date.now()}`;
  const rows = [
    ...buildSalesRows(order),
    ...buildStockMovementRows(movements, "ORDER"),
  ];
  return makeSheetJob({
    syncId,
    type: "ORDER",
    sourceId: order.id,
    description: `${order.orderNo || order.id} -> Sales + Stock Movements`,
    rows,
  });
}

export function makeOrderVoidSheetJob(order, movements = []) {
  const syncId = `SYNC-VOID-${order.id}-${Date.now()}`;
  const rows = [
    ...buildSalesRows(order, { voidAdjustment: true }),
    ...buildStockMovementRows(movements, "ORDER_VOID"),
  ];
  return makeSheetJob({
    syncId,
    type: "ORDER_VOID",
    sourceId: order.id,
    description: `${order.orderNo || order.id} void -> Sales + Stock Movements`,
    rows,
  });
}

export function makeExpenseSheetJob(expense, movements = []) {
  const syncId = `SYNC-EXPENSE-${expense.id}-${Date.now()}`;
  const rows = [
    ...buildExpenseRows(expense),
    ...buildStockMovementRows(movements, "EXPENSE"),
    buildAuditRow({
      createdAt: expense.createdAt,
      eventType: "EXPENSE_CREATE",
      sourceType: "EXPENSE",
      sourceId: expense.id,
      itemName: `${expense.items?.length || 0} รายการ`,
      amount: expense.totalAmount,
      reason: expense.note || "บันทึกรายจ่าย",
      raw: expense,
    }),
  ];
  const operations = buildMonthlyExpenseOperations(expense);
  return makeSheetJob({
    syncId,
    type: "EXPENSE",
    sourceId: expense.id,
    description: `${expense.id} -> Expenses + Stock Movements`,
    rows,
    operations,
  });
}

export function makeExpenseDeleteSheetJob(expense, movements = []) {
  const syncId = `SYNC-EXPENSE-DELETE-${expense.id}-${Date.now()}`;
  const operations = buildMonthlyExpenseDeleteOperations(expense);
  const rows = [
    ...buildStockMovementRows(movements, "EXPENSE_DELETE"),
    buildAuditRow({
      createdAt: new Date().toISOString(),
      eventType: "EXPENSE_DELETE",
      sourceType: "EXPENSE",
      sourceId: expense.id,
      itemName: `${expense.items?.length || 0} รายการ`,
      amount: expense.totalAmount,
      reason: "ลบรายจ่าย",
      raw: expense,
    }),
  ];
  return makeSheetJob({
    syncId,
    type: "EXPENSE_DELETE",
    sourceId: expense.id,
    description: `${expense.id} delete -> Audit Log + monthly expense cleanup`,
    rows,
    operations,
  });
}

export function makeShiftSheetJob(shift, summary) {
  const syncId = `SYNC-SHIFT-${shift.id}-${Date.now()}`;
  const rows = [buildShiftRow(shift, summary)];
  const operations = [buildMonthlyRevenueOperation(shift, summary)].filter(Boolean);
  return makeSheetJob({
    syncId,
    type: "SHIFT_SUMMARY",
    sourceId: shift.id,
    description: `${shift.id} -> Shift Summary`,
    rows,
    operations,
  });
}

export function makeStockMovementSheetJob(movement, sourceType = movement.sourceType || "ADJUSTMENT") {
  const syncId = `SYNC-STOCK-${movement.id}-${Date.now()}`;
  const rows = [
    ...buildStockMovementRows([movement], sourceType),
    buildAuditRow({
      createdAt: movement.createdAt,
      eventType: "STOCK_CHANGE",
      sourceType,
      sourceId: movement.sourceId || movement.id,
      itemId: movement.ingredientId,
      itemName: movement.ingredientName,
      beforeValue: movement.quantityBefore,
      changeValue: movement.quantityDelta,
      afterValue: movement.quantityAfter,
      reason: movement.reason || movement.type || "",
      raw: movement,
    }),
  ];
  return makeSheetJob({
    syncId,
    type: "STOCK_MOVEMENT",
    sourceId: movement.id,
    description: `${movement.ingredientName || movement.ingredientId} -> Stock Movements`,
    rows,
  });
}

function buildAuditRow(entry) {
  const parts = splitDateTime(entry.createdAt);
  return {
    tab: SHEET_TABS.auditLog,
    values: [
      entry.createdAt || new Date().toISOString(),
      parts.date,
      parts.time,
      entry.eventType || "",
      entry.sourceType || "",
      entry.sourceId || "",
      entry.itemId || "",
      entry.itemName || "",
      entry.beforeValue ?? "",
      entry.changeValue ?? "",
      entry.afterValue ?? "",
      entry.amount ?? "",
      entry.reason || "",
      safeJson(entry.raw || {}),
    ],
  };
}

function safeJson(value) {
  try {
    return JSON.stringify(value);
  } catch {
    return "";
  }
}

function makeSheetJob({ syncId, type, sourceId, description, rows, operations = [] }) {
  return {
    type,
    syncId,
    sourceId,
    description,
    targetTabs: Array.from(new Set(rows.map((row) => row.tab))),
    rows,
    operations,
  };
}

function buildMonthlyRevenueOperation(shift, summary) {
  const date = parseSheetDate(summary?.closedAt || shift?.closedAt || new Date().toISOString());
  if (!date) return null;
  return {
    type: "UPSERT_DAILY_REVENUE",
    monthTab: String(date.month),
    day: date.day,
    dateValue: date.day,
    cashSales: Number(summary?.cashSales || 0),
    transferSales: Number(summary?.transferSales || 0),
    shiftId: shift?.id || "",
  };
}

function buildMonthlyExpenseOperations(expense) {
  const date = parseSheetDate(expense.expenseDate || expense.createdAt);
  if (!date) return [];
  return (expense.items || []).map((item, index) => ({
    type: "APPEND_MONTHLY_EXPENSE",
    monthTab: String(date.month),
    expenseId: expense.id,
    itemId: item?.id || `${expense.id}-${index + 1}`,
    values: [
      date.display,
      item?.name || "",
      item?.purchaseUnit || item?.baseUnit || "",
      Number(item?.purchaseQuantity || 0),
      Number(item?.unitPrice || 0),
      Number(item?.lineTotal || 0),
    ],
    meta: [expense.id, item?.id || `${index + 1}`],
  }));
}

function buildMonthlyExpenseDeleteOperations(expense) {
  const date = parseSheetDate(expense.expenseDate || expense.createdAt);
  if (!date) return [];
  return (expense.items || []).map((item, index) => ({
    type: "DELETE_MONTHLY_EXPENSE",
    monthTab: String(date.month),
    expenseId: expense.id,
    itemId: item?.id || `${index + 1}`,
  }));
}

function buildSalesRows(order, options = {}) {
  const orderDate = splitDateTime(order.createdAt);
  const itemRows = order.items?.length ? order.items : [null];
  const multiplier = options.voidAdjustment ? -1 : 1;
  return itemRows.map((item) => ({
    tab: SHEET_TABS.sales,
    values: [
      order.id,
      order.orderNo || "",
      order.createdAt || "",
      orderDate.date,
      orderDate.time,
      order.salesChannel || "store",
      order.paymentMethod || "",
      Number(order.totalAmount || 0) * multiplier,
      options.voidAdjustment ? "" : order.cashReceived ?? "",
      options.voidAdjustment ? "" : Number(order.changeDue || 0),
      order.shiftId || "",
      item?.productId || "",
      item?.name || "",
      item ? Number(item.quantity || 0) * multiplier : "",
      item?.unitPrice || "",
      item ? Number(item.quantity || 0) * Number(item.unitPrice || 0) * multiplier : "",
      (item?.modifiers || []).join(", "),
      item?.note || "",
      order.paymentStatus || "",
      order.voidedAt || "",
      order.voidReason || "",
      order.voidRefundMethod || "",
      order.voidRefundAmount ?? "",
      order.voidStockRestored ? "TRUE" : "",
    ],
  }));
}

function buildExpenseRows(expense) {
  const itemRows = expense.items?.length ? expense.items : [null];
  return itemRows.map((item) => ({
    tab: SHEET_TABS.expenses,
    values: [
      expense.id,
      expense.expenseDate || splitDateTime(expense.createdAt).date,
      expense.createdAt || "",
      item?.ingredientId || "",
      item?.name || "",
      item?.ingredientId ? item.name : "",
      item?.purchaseUnit || "",
      item?.baseUnit || "",
      item?.purchaseQuantity || "",
      item?.unitPrice || "",
      item?.lineTotal || "",
      item?.stockQuantity || "",
      item?.category || "ยังไม่ได้จัดหมวด",
      item?.subcategory || "ยังไม่ได้จัดหมวดย่อย",
      item?.note || "",
      Number(expense.totalAmount || 0),
    ],
  }));
}

function buildStockMovementRows(movements, sourceType) {
  return movements.map((movement) => ({
    tab: SHEET_TABS.stockMovements,
    values: [
      movement.createdAt || "",
      splitDateTime(movement.createdAt).date,
      splitDateTime(movement.createdAt).time,
      movement.type || "",
      movement.ingredientId || "",
      movement.ingredientName || "",
      movement.quantityBefore ?? "",
      Number(movement.quantityDelta || 0),
      Number(movement.quantityAfter || 0),
      movement.unit || "",
      sourceType,
      movement.sourceId || "",
      movement.reason || "",
    ],
  }));
}

function buildShiftRow(shift, summary) {
  return {
    tab: SHEET_TABS.shiftSummary,
    values: [
      shift.id,
      summary.openedAt || shift.openedAt || "",
      summary.closedAt || shift.closedAt || "",
      Number(shift.openingCash || 0),
      Number(summary.cashSales || 0),
      Number(summary.transferSales || 0),
      Number(summary.totalSales || 0),
      Number(summary.expectedCash || 0),
      Number(summary.closingCash ?? shift.closingCash ?? 0),
      Number(summary.cashDifference || 0),
      Number(summary.orderCount || 0),
      Number(summary.grossSales || summary.totalSales || 0),
      Number(summary.voidOrderCount || 0),
      Number(summary.voidAmount || 0),
      Number(summary.cashRefundAmount || 0),
      Number(summary.transferRefundAmount || 0),
      Number(summary.netSales || summary.totalSales || 0),
    ],
  };
}

function splitDateTime(value) {
  if (!value) return { date: "", time: "" };
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return { date: "", time: "" };
  return {
    date: date.toLocaleDateString("th-TH"),
    time: date.toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit", second: "2-digit" }),
  };
}

function parseSheetDate(value) {
  if (!value) return null;
  const isoDateOnly = typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
  const date = isoDateOnly ? new Date(`${value}T12:00:00`) : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const day = date.getDate();
  const month = date.getMonth() + 1;
  const year = date.getFullYear();
  return {
    day,
    month,
    year,
    display: `${String(day).padStart(2, "0")}/${String(month).padStart(2, "0")}/${year}`,
  };
}
