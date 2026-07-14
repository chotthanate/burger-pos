export const BURGER_POS_SHEET_ID = "1-JJ9u2NjqBrQtgrBb4sUsmwdV36GP25g-rJPrwv8mpI";

export const SHEET_TABS = {
  sales: "Sales",
  income: "รายรับ",
  expenses: "รายจ่าย",
  stockMovements: "Stock Movements",
  shiftSummary: "Shift Summary",
  auditLog: "Audit Log",
};

const LEGACY_SHEET_TABS = {
  income: "Income",
  expenses: "Expenses",
};

export const SHEET_HEADERS = {
  [SHEET_TABS.sales]: [
    "รหัสออร์เดอร์",
    "เลขออร์เดอร์",
    "เวลาบันทึก",
    "วันที่",
    "เวลา",
    "ช่องทางขาย",
    "วิธีชำระเงิน",
    "ยอดรวม",
    "เงินที่รับ",
    "เงินทอน",
    "รหัสกะ",
    "รหัสสินค้า",
    "ชื่อสินค้า",
    "จำนวน",
    "ราคาต่อหน่วย",
    "ยอดรายการ",
    "ตัวเลือกเสริม",
    "หมายเหตุรายการ",
    "สถานะออร์เดอร์",
    "เวลายกเลิก",
    "เหตุผลยกเลิก",
    "วิธีคืนเงิน",
    "ยอดคืนเงิน",
    "คืนสต็อกแล้ว",
  ],
  [SHEET_TABS.income]: [
    "รหัสรายรับ",
    "วันที่",
    "เวลาปิดกะ",
    "รหัสกะ",
    "ยอดขายรวม",
    "เงินสด",
    "เงินโอน",
    "ไทยช่วยไทย",
    "ยอดก่อนยกเลิก",
    "ยอดยกเลิก",
    "คืนเงินสด",
    "คืนเงินโอน",
    "จำนวนออร์เดอร์",
    "จำนวนเบอร์เกอร์",
    "จำนวน BBQ",
  ],
  [SHEET_TABS.expenses]: [
    "รหัสรายจ่าย",
    "วันที่",
    "วันเวลาบันทึก",
    "รหัสวัตถุดิบ",
    "ชื่อรายการ",
    "ชื่อวัตถุดิบ",
    "หน่วยซื้อ",
    "หน่วยสต็อก",
    "จำนวนซื้อ",
    "ราคาต่อหน่วย",
    "ยอดรายการ",
    "จำนวนเข้าสต็อก",
    "ประเภทหลัก",
    "ประเภทย่อย",
    "หมายเหตุ",
    "ยอดรวม",
    "ประเภทรายจ่าย",
    "รหัสรายการฐานข้อมูล",
  ],
  [SHEET_TABS.stockMovements]: [
    "เวลาบันทึก",
    "วันที่",
    "เวลา",
    "ประเภทความเคลื่อนไหว",
    "รหัสวัตถุดิบ",
    "ชื่อวัตถุดิบ",
    "จำนวนก่อนหน้า",
    "จำนวนเปลี่ยนแปลง",
    "จำนวนหลังปรับ",
    "หน่วย",
    "แหล่งที่มา",
    "รหัสอ้างอิง",
    "เหตุผล",
  ],
  [SHEET_TABS.shiftSummary]: [
    "รหัสกะ",
    "เวลาเปิดกะ",
    "เวลาปิดกะ",
    "เงินเริ่มต้น",
    "เงินสด",
    "เงินโอน",
    "ยอดขายรวม",
    "เงินที่ควรมี",
    "เงินที่นับได้",
    "ส่วนต่างเงินสด",
    "จำนวนออร์เดอร์",
    "ยอดก่อนยกเลิก",
    "จำนวนออร์เดอร์ยกเลิก",
    "ยอดยกเลิก",
    "คืนเงินสด",
    "คืนเงินโอน",
    "ไทยช่วยไทย",
    "จำนวนเบอร์เกอร์",
    "จำนวน BBQ",
  ],
  [SHEET_TABS.auditLog]: [
    "เวลาบันทึก",
    "วันที่",
    "เวลา",
    "ประเภทเหตุการณ์",
    "แหล่งที่มา",
    "รหัสอ้างอิง",
    "รหัสรายการ",
    "ชื่อรายการ",
    "ค่าก่อนหน้า",
    "ค่าที่เปลี่ยน",
    "ค่าหลังปรับ",
    "ยอดเงิน",
    "เหตุผล",
    "ข้อมูลดิบ JSON",
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
  const exportRows = rows.filter((row) => row.tab !== SHEET_TABS.auditLog);
  return makeSheetJob({
    syncId,
    type: "EXPENSE",
    sourceId: expense.id,
    description: `${expense.id} -> รายจ่าย + Stock Movements`,
    rows: exportRows,
  });
}

export function makeExpenseDeleteSheetJob(expense, movements = []) {
  const syncId = `SYNC-EXPENSE-DELETE-${expense.id}-${Date.now()}`;
  const operations = [
    { type: "DELETE_RAW_EXPENSE", expenseId: expense.id },
  ];
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

export function makeResetSheetJob(mode = "transactions") {
  const normalizedMode = mode === "all" ? "all" : "transactions";
  return makeSheetJob({
    syncId: `SYNC-RESET-${normalizedMode}-${Date.now()}`,
    type: normalizedMode === "all" ? "RESET_ALL_DATA" : "RESET_TRANSACTION_DATA",
    sourceId: normalizedMode,
    description: normalizedMode === "all"
      ? "Reset all POS data in Google Sheet"
      : "Reset transaction POS data in Google Sheet",
    rows: [],
    operations: [{ type: "RESET_BURGER_POS_SHEET", mode: normalizedMode }],
  });
}

export function normalizeSheetJobForSync(job) {
  if (!job) return job;
  if (job.type === "SHIFT_SUMMARY") {
    const rows = (Array.isArray(job.rows) ? job.rows : []).map(normalizeSheetRowTab);
    const shiftRow = rows.find((row) => row?.tab === SHEET_TABS.shiftSummary && Array.isArray(row.values));
    const rowsWithoutIncome = rows.filter((row) => !isIncomeTab(row?.tab));
    const normalizedRows = shiftRow
      ? [...rowsWithoutIncome, buildIncomeRowFromShiftValues(shiftRow.values)]
      : rowsWithoutIncome;
    const normalizedOperations = (Array.isArray(job.operations) ? job.operations : [])
      .filter((operation) => operation?.type !== "UPSERT_DAILY_REVENUE");
    return {
      ...job,
      rows: normalizedRows,
      operations: normalizedOperations,
      targetTabs: Array.from(new Set(normalizedRows.map((row) => row.tab))),
    };
  }
  return stripRetiredMonthlyExpenseOperations({
    ...job,
    rows: Array.isArray(job.rows) ? job.rows.map(normalizeSheetRowTab) : job.rows,
  });
}

export function makeShiftSheetJob(shift, summary) {
  const syncId = `SYNC-SHIFT-${shift.id}-${Date.now()}`;
  const rows = [buildShiftRow(shift, summary), buildIncomeRow(shift, summary)];
  return makeSheetJob({
    syncId,
    type: "SHIFT_SUMMARY",
    sourceId: shift.id,
    description: `${shift.id} -> Shift Summary`,
    rows,
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
      formatBangkokDateTime(entry.createdAt),
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

function stripRetiredMonthlyExpenseOperations(job) {
  const operations = (Array.isArray(job.operations) ? job.operations : [])
    .filter((operation) => operation?.type !== "APPEND_MONTHLY_EXPENSE" && operation?.type !== "DELETE_MONTHLY_EXPENSE");
  return operations.length === (job.operations || []).length ? job : { ...job, operations };
}

function normalizeSheetRowTab(row) {
  if (!row || !row.tab) return row;
  if (row.tab === LEGACY_SHEET_TABS.income) return { ...row, tab: SHEET_TABS.income };
  if (row.tab === LEGACY_SHEET_TABS.expenses) return { ...row, tab: SHEET_TABS.expenses };
  return row;
}

function isIncomeTab(tabName) {
  return tabName === SHEET_TABS.income || tabName === LEGACY_SHEET_TABS.income;
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
      formatBangkokDateTime(order.createdAt),
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
      formatBangkokDateTime(order.voidedAt),
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
      formatBangkokDate(expense.expenseDate || expense.createdAt),
      formatBangkokDateTime(expense.createdAt),
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
      item?.mode === "ingredient" ? "วัตถุดิบ" : "รายจ่ายทั่วไป",
      item?.generalExpenseItemId || "",
    ],
  }));
}

function buildIncomeRow(shift, summary) {
  const closedAt = summary.closedAt || shift.closedAt || new Date().toISOString();
  return {
    tab: SHEET_TABS.income,
    values: [
      `INC-${shift.id || Date.now()}`,
      formatBangkokDate(closedAt),
      formatBangkokDateTime(closedAt),
      shift.id || "",
      Number(summary.totalSales || 0),
      Number(summary.cashSales || 0),
      Number(summary.transferSales || 0),
      Number(summary.thaiChuayThaiSales || 0),
      Number(summary.grossSales || summary.totalSales || 0),
      Number(summary.voidAmount || 0),
      Number(summary.cashRefundAmount || 0),
      Number(summary.transferRefundAmount || 0),
      Number(summary.orderCount || 0),
      Number(summary.burgerQuantity || 0),
      Number(summary.bbqQuantity || 0),
    ],
  };
}

function buildIncomeRowFromShiftValues(values = []) {
  const closedAt = values[2] || new Date().toISOString();
  const shiftId = values[0] || "";
  const hasLegacyNetSalesColumn = values.length > 19;
  const thaiChuayThaiIndex = hasLegacyNetSalesColumn ? 17 : 16;
  const burgerQuantityIndex = hasLegacyNetSalesColumn ? 18 : 17;
  const bbqQuantityIndex = hasLegacyNetSalesColumn ? 19 : 18;
  return {
    tab: SHEET_TABS.income,
    values: [
      `INC-${shiftId || Date.now()}`,
      formatBangkokDate(closedAt),
      formatBangkokDateTime(closedAt),
      shiftId,
      Number(values[6] || 0),
      Number(values[4] || 0),
      Number(values[5] || 0),
      Number(values[thaiChuayThaiIndex] || 0),
      Number(values[11] || values[6] || 0),
      Number(values[13] || 0),
      Number(values[14] || 0),
      Number(values[15] || 0),
      Number(values[10] || 0),
      Number(values[burgerQuantityIndex] || 0),
      Number(values[bbqQuantityIndex] || 0),
    ],
  };
}

function buildStockMovementRows(movements, sourceType) {
  return movements.map((movement) => ({
    tab: SHEET_TABS.stockMovements,
    values: [
      formatBangkokDateTime(movement.createdAt),
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
      formatBangkokDateTime(summary.openedAt || shift.openedAt),
      formatBangkokDateTime(summary.closedAt || shift.closedAt),
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
      Number(summary.thaiChuayThaiSales || 0),
      Number(summary.burgerQuantity || 0),
      Number(summary.bbqQuantity || 0),
    ],
  };
}

function splitDateTime(value) {
  if (!value) return { date: "", time: "" };
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return { date: "", time: "" };
  return {
    date: formatBangkokDate(value),
    time: formatBangkokTime(value),
  };
}

function getBangkokDateParts(value, options = {}) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const parts = new Intl.DateTimeFormat("en", {
    timeZone: "Asia/Bangkok",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    ...(options.time ? { hour: "2-digit", minute: "2-digit", hour12: false } : {}),
  }).formatToParts(date);
  return Object.fromEntries(parts.map((part) => [part.type, part.value]));
}

function formatBangkokDate(value) {
  if (!value) return "";
  const values = getBangkokDateParts(value);
  if (!values) return String(value || "");
  return `${values.day}/${values.month}/${values.year}`;
}

function formatBangkokTime(value) {
  if (!value) return "";
  const values = getBangkokDateParts(value, { time: true });
  if (!values) return "";
  return `${values.hour}:${values.minute}`;
}

function formatBangkokDateTime(value) {
  if (!value) return "";
  const values = getBangkokDateParts(value, { time: true });
  if (!values) return String(value || "");
  return `${values.day}/${values.month}/${values.year} ${values.hour}:${values.minute}`;
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
