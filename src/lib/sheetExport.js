export const BURGER_POS_SHEET_ID = "1-JJ9u2NjqBrQtgrBb4sUsmwdV36GP25g-rJPrwv8mpI";

export const SHEET_TABS = {
  sales: "Sales",
  expenses: "Expenses",
  stockMovements: "Stock Movements",
  shiftSummary: "Shift Summary",
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
    "type",
    "ingredient_id",
    "ingredient_name",
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

export function makeExpenseSheetJob(expense, movements = []) {
  const syncId = `SYNC-EXPENSE-${expense.id}-${Date.now()}`;
  const rows = [
    ...buildExpenseRows(expense),
    ...buildStockMovementRows(movements, "EXPENSE"),
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
  const rows = [buildShiftRow(shift, summary)];
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

function buildSalesRows(order) {
  const orderDate = splitDateTime(order.createdAt);
  const itemRows = order.items?.length ? order.items : [null];
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
      Number(order.totalAmount || 0),
      order.cashReceived ?? "",
      Number(order.changeDue || 0),
      order.shiftId || "",
      item?.productId || "",
      item?.name || "",
      item?.quantity || "",
      item?.unitPrice || "",
      item ? Number(item.quantity || 0) * Number(item.unitPrice || 0) : "",
      (item?.modifiers || []).join(", "),
      item?.note || "",
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
      movement.type || "",
      movement.ingredientId || "",
      movement.ingredientName || "",
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
      Number(summary.countedCash || shift.closingCash || 0),
      Number(summary.cashDifference || 0),
      Number(summary.orderCount || 0),
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
