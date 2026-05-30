export const BURGER_POS_SHEET_ID = "18dF1U5pjfd4_y9KziNptiL6Mf_PjFAsxv-5CA4HgpAc";

export const SHEET_TABS = {
  sales: "Sales",
  expenses: "Expenses",
  stockMovements: "Stock Movements",
  shiftSummary: "Shift Summary",
};

export const SHEET_HEADERS = {
  [SHEET_TABS.sales]: [
    "sync_id",
    "record_type",
    "order_id",
    "order_no",
    "created_at",
    "date",
    "time",
    "sales_channel",
    "payment_method",
    "payment_status",
    "total_amount",
    "cash_received",
    "change_due",
    "shift_id",
    "item_index",
    "product_id",
    "product_name",
    "quantity",
    "unit_price",
    "line_total",
    "modifiers",
    "item_note",
    "order_note",
    "print_kitchen",
    "print_receipt",
    "source",
    "synced_at",
    "raw_json",
  ],
  [SHEET_TABS.expenses]: [
    "sync_id",
    "expense_id",
    "created_at",
    "expense_date",
    "item_index",
    "mode",
    "item_name",
    "ingredient_id",
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
    "source",
    "synced_at",
    "raw_json",
  ],
  [SHEET_TABS.stockMovements]: [
    "sync_id",
    "movement_id",
    "created_at",
    "date",
    "type",
    "ingredient_id",
    "ingredient_name",
    "quantity_delta",
    "quantity_after",
    "unit",
    "source_type",
    "source_id",
    "reason",
    "synced_at",
    "raw_json",
  ],
  [SHEET_TABS.shiftSummary]: [
    "sync_id",
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
    "synced_at",
    "raw_json",
  ],
};

export function makeOrderSheetJob(order, movements = []) {
  const syncId = `SYNC-ORDER-${order.id}-${Date.now()}`;
  const rows = [
    ...buildSalesRows(syncId, order),
    ...buildStockMovementRows(syncId, movements, "ORDER"),
  ];
  return makeSheetJob({
    syncId,
    type: "ORDER",
    sourceId: order.id,
    description: `${order.orderNo || order.id} -> Sales + Stock Movements`,
    rows,
  });
}

export function makeExpenseSheetJob(expense, movements = []) {
  const syncId = `SYNC-EXPENSE-${expense.id}-${Date.now()}`;
  const rows = [
    ...buildExpenseRows(syncId, expense),
    ...buildStockMovementRows(syncId, movements, "EXPENSE"),
  ];
  return makeSheetJob({
    syncId,
    type: "EXPENSE",
    sourceId: expense.id,
    description: `${expense.id} -> Expenses + Stock Movements`,
    rows,
  });
}

export function makeShiftSheetJob(shift, summary) {
  const syncId = `SYNC-SHIFT-${shift.id}-${Date.now()}`;
  const rows = [buildShiftRow(syncId, shift, summary)];
  return makeSheetJob({
    syncId,
    type: "SHIFT_SUMMARY",
    sourceId: shift.id,
    description: `${shift.id} -> Shift Summary`,
    rows,
  });
}

function makeSheetJob({ syncId, type, sourceId, description, rows }) {
  return {
    type,
    syncId,
    sourceId,
    description,
    targetTabs: Array.from(new Set(rows.map((row) => row.tab))),
    rows,
  };
}

function buildSalesRows(syncId, order) {
  const orderDate = splitDateTime(order.createdAt);
  const itemRows = order.items?.length ? order.items : [null];
  return itemRows.map((item, index) => ({
    tab: SHEET_TABS.sales,
    values: [
      syncId,
      item ? "ORDER_ITEM" : "ORDER",
      order.id,
      order.orderNo || "",
      order.createdAt || "",
      orderDate.date,
      orderDate.time,
      order.salesChannel || "store",
      order.paymentMethod || "",
      order.paymentStatus || "",
      Number(order.totalAmount || 0),
      order.cashReceived ?? "",
      Number(order.changeDue || 0),
      order.shiftId || "",
      item ? index + 1 : "",
      item?.productId || "",
      item?.name || "",
      item?.quantity || "",
      item?.unitPrice || "",
      item ? Number(item.quantity || 0) * Number(item.unitPrice || 0) : "",
      (item?.modifiers || []).join(", "),
      item?.note || "",
      order.note || "",
      order.printOptions?.kitchen !== false,
      order.printOptions?.receipt === true,
      "POS",
      "",
      JSON.stringify({ order, item }),
    ],
  }));
}

function buildExpenseRows(syncId, expense) {
  const itemRows = expense.items?.length ? expense.items : [null];
  return itemRows.map((item, index) => ({
    tab: SHEET_TABS.expenses,
    values: [
      syncId,
      expense.id,
      expense.createdAt || "",
      expense.expenseDate || splitDateTime(expense.createdAt).date,
      item ? index + 1 : "",
      item?.mode || "",
      item?.name || "",
      item?.ingredientId || "",
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
      "POS_EXPENSE",
      "",
      JSON.stringify({ expense, item }),
    ],
  }));
}

function buildStockMovementRows(syncId, movements, sourceType) {
  return movements.map((movement) => ({
    tab: SHEET_TABS.stockMovements,
    values: [
      syncId,
      movement.id,
      movement.createdAt || "",
      splitDateTime(movement.createdAt).date,
      movement.type || "",
      movement.ingredientId || "",
      movement.ingredientName || "",
      Number(movement.quantityDelta || 0),
      Number(movement.quantityAfter || 0),
      movement.unit || "",
      sourceType,
      movement.sourceId || "",
      movement.reason || "",
      "",
      JSON.stringify(movement),
    ],
  }));
}

function buildShiftRow(syncId, shift, summary) {
  return {
    tab: SHEET_TABS.shiftSummary,
    values: [
      syncId,
      shift.id,
      summary.openedAt || shift.openedAt || "",
      summary.closedAt || shift.closedAt || "",
      Number(shift.openingCash || 0),
      Number(summary.cashSales || 0),
      Number(summary.transferSales || 0),
      Number(summary.totalSales || 0),
      Number(summary.expectedCash || 0),
      Number(summary.countedCash || shift.closingCash || 0),
      Number(summary.cashDifference || 0),
      Number(summary.orderCount || 0),
      "",
      JSON.stringify({ shift, summary }),
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
