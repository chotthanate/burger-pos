const SHEET_ACTION_APPEND = "appendSheetSyncJob";
const APP_STATE_ACTION_GET = "getAppState";
const APP_STATE_ACTION_UPSERT = "upsertAppState";
const LINE_ACTION_SEND = "sendLineMessage";
const DEFAULT_SHEET_ID = "1-JJ9u2NjqBrQtgrBb4sUsmwdV36GP25g-rJPrwv8mpI";
const APP_STATE_TAB = "App State";
const APP_STATE_HEADERS = ["รหัสร้าน", "คีย์ข้อมูล", "ข้อมูล JSON", "เวลาอัปเดต", "แหล่งที่มา"];
const DATA_TAB_ALIASES = {
  "Income": "รายรับ",
  "Expenses": "รายจ่าย",
};
const DATA_SHEET_HEADERS = {
  "Sales": [
    "รหัสออร์เดอร์", "เลขออร์เดอร์", "เวลาบันทึก", "วันที่", "เวลา",
    "ช่องทางขาย", "วิธีชำระเงิน", "ยอดรวม", "เงินที่รับ", "เงินทอน",
    "รหัสกะ", "รหัสสินค้า", "ชื่อสินค้า", "จำนวน", "ราคาต่อหน่วย",
    "ยอดรายการ", "ตัวเลือกเสริม", "หมายเหตุรายการ", "สถานะออร์เดอร์",
    "เวลายกเลิก", "เหตุผลยกเลิก", "วิธีคืนเงิน", "ยอดคืนเงิน", "คืนสต็อกแล้ว",
  ],
  "รายรับ": [
    "รหัสรายรับ", "วันที่", "เวลาปิดกะ", "รหัสกะ", "ยอดขายรวม",
    "เงินสด", "เงินโอน", "ไทยช่วยไทย", "ยอดก่อนยกเลิก", "ยอดยกเลิก",
    "คืนเงินสด", "คืนเงินโอน", "จำนวนออร์เดอร์", "จำนวนเบอร์เกอร์", "จำนวน BBQ",
  ],
  "รายจ่าย": [
    "รหัสรายจ่าย", "วันที่", "วันเวลาบันทึก", "รหัสวัตถุดิบ", "ชื่อรายการ",
    "ชื่อวัตถุดิบ", "หน่วยซื้อ", "หน่วยสต็อก", "จำนวนซื้อ", "ราคาต่อหน่วย",
    "ยอดรายการ", "จำนวนเข้าสต็อก", "ประเภทหลัก", "ประเภทย่อย", "หมายเหตุ",
    "ยอดรวม", "ประเภทรายจ่าย", "รหัสรายการฐานข้อมูล",
  ],
  "Stock Movements": [
    "เวลาบันทึก", "วันที่", "เวลา", "ประเภทความเคลื่อนไหว", "รหัสวัตถุดิบ",
    "ชื่อวัตถุดิบ", "จำนวนก่อนหน้า", "จำนวนเปลี่ยนแปลง", "จำนวนหลังปรับ",
    "หน่วย", "แหล่งที่มา", "รหัสอ้างอิง", "เหตุผล",
  ],
  "Shift Summary": [
    "รหัสกะ", "เวลาเปิดกะ", "เวลาปิดกะ", "เงินเริ่มต้น", "เงินสด",
    "เงินโอน", "ยอดขายรวม", "เงินที่ควรมี", "เงินที่นับได้", "ส่วนต่างเงินสด",
    "จำนวนออร์เดอร์", "ยอดก่อนยกเลิก", "จำนวนออร์เดอร์ยกเลิก", "ยอดยกเลิก",
    "คืนเงินสด", "คืนเงินโอน", "ไทยช่วยไทย", "จำนวนเบอร์เกอร์", "จำนวน BBQ",
  ],
};

function authorize() {
  return SpreadsheetApp.openById(DEFAULT_SHEET_ID).getName();
}

function doPost(e) {
  const payload = parseJsonBody_(e);
  if (payload.action === SHEET_ACTION_APPEND) {
    return json_(appendSheetSyncJob_(payload));
  }
  if (payload.action === APP_STATE_ACTION_GET) {
    return json_(getAppState_(payload));
  }
  if (payload.action === APP_STATE_ACTION_UPSERT) {
    return json_(upsertAppState_(payload));
  }
  if (payload.action === LINE_ACTION_SEND) {
    return json_(sendLineMessage_(payload));
  }
  return json_({ ok: false, error: "Unknown action" });
}

function appendSheetSyncJob_(payload) {
  const spreadsheet = SpreadsheetApp.openById(payload.sheetId);
  const job = payload.job || {};
  const rows = normalizeSheetRows_(job);
  const operations = normalizeSheetOperations_(job, job && job.operations ? job.operations : []);
  prepareRawRowsForAppend_(spreadsheet, job, rows);
  rows.forEach((row) => {
    const sheet = getOrCreateDataSheet_(spreadsheet, row.tab);
    sheet.appendRow(normalizeRowValuesForSheet_(row));
  });
  const operationResults = runSheetOperations_(spreadsheet, operations);
  return { ok: true, appendedRows: rows.length, operations: operationResults };
}

function getAppState_(payload) {
  const spreadsheet = SpreadsheetApp.openById(payload.sheetId || DEFAULT_SHEET_ID);
  const sheet = getOrCreateAppStateSheet_(spreadsheet);
  const storeId = String(payload.storeId || "boy-burger-main");
  const keys = Array.isArray(payload.keys) ? payload.keys.map(String) : [];
  const keySet = keys.length ? keyMap_(keys) : null;
  const state = {};
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return { ok: true, state: {} };

  const values = sheet.getRange(2, 1, lastRow - 1, APP_STATE_HEADERS.length).getValues();
  values.forEach(function(row) {
    const rowStoreId = String(row[0] || "");
    const key = String(row[1] || "");
    if (rowStoreId !== storeId || !key) return;
    if (keySet && !keySet[key]) return;
    try {
      state[key] = JSON.parse(String(row[2] || "null"));
    } catch (error) {
      state[key] = null;
    }
  });
  return { ok: true, state: state };
}

function upsertAppState_(payload) {
  const spreadsheet = SpreadsheetApp.openById(payload.sheetId || DEFAULT_SHEET_ID);
  const sheet = getOrCreateAppStateSheet_(spreadsheet);
  const storeId = String(payload.storeId || "boy-burger-main");
  const rows = Array.isArray(payload.rows) ? payload.rows : [];
  if (!rows.length) return { ok: true, updatedRows: 0 };

  const existing = buildAppStateIndex_(sheet);
  const now = new Date().toISOString();
  let updatedRows = 0;
  rows.forEach(function(row) {
    const key = String(row && row.key || "");
    if (!key) return;
    const payloadJson = JSON.stringify(row.payload == null ? null : row.payload);
    const updatedAt = row.updatedAt || now;
    const values = [storeId, key, payloadJson, updatedAt, "pos-app"];
    const indexKey = storeId + "\u0000" + key;
    const existingRow = existing[indexKey];
    if (existingRow) {
      sheet.getRange(existingRow, 1, 1, APP_STATE_HEADERS.length).setValues([values]);
    } else {
      sheet.appendRow(values);
    }
    updatedRows += 1;
  });
  return { ok: true, updatedRows: updatedRows };
}

function normalizeRowValuesForSheet_(row) {
  const values = row && row.values ? row.values.slice() : [];
  const tabName = canonicalDataTabName_(row && row.tab);
  if (tabName === "รายรับ") {
    values[1] = formatSheetDate_(values[1]);
    values[2] = formatSheetDateTime_(values[2]);
  }
  if (tabName === "รายจ่าย") {
    values[1] = formatSheetDate_(values[1]);
    values[2] = formatSheetDateTime_(values[2]);
  }
  if (tabName === "Sales") {
    values[2] = formatSheetDateTime_(values[2]);
    values[19] = formatSheetDateTime_(values[19]);
  }
  if (tabName === "Stock Movements") {
    values[0] = formatSheetDateTime_(values[0]);
  }
  if (tabName === "Shift Summary") {
    values[1] = formatSheetDateTime_(values[1]);
    values[2] = formatSheetDateTime_(values[2]);
  }
  if (tabName === "Audit Log") {
    values[0] = formatSheetDateTime_(values[0]);
  }
  return values;
}

function prepareRawRowsForAppend_(spreadsheet, job, rows) {
  if (!job || job.type !== "EXPENSE") return;
  const expenseIds = {};
  if (job.sourceId) expenseIds[String(job.sourceId)] = true;
  rows.forEach(function(row) {
    if (row && canonicalDataTabName_(row.tab) === "รายจ่าย" && row.values && row.values[0]) {
      expenseIds[String(row.values[0])] = true;
    }
  });
  const ids = Object.keys(expenseIds);
  if (!ids.length) return;
  ids.forEach(function(expenseId) {
    deleteRawExpense_(spreadsheet, { expenseId: expenseId });
  });
  deleteStockMovementRowsBySourceIds_(spreadsheet, ids);
}

function normalizeSheetRows_(job) {
  const rows = job && job.rows ? job.rows.slice() : [];
  if (!job || job.type !== "SHIFT_SUMMARY") return rows;
  const shiftRow = rows.find(function(row) {
    return row && row.tab === "Shift Summary" && row.values;
  });
  const rowsWithoutIncome = rows.filter(function(row) {
    return !row || canonicalDataTabName_(row.tab) !== "รายรับ";
  });
  if (!shiftRow) return rowsWithoutIncome;
  rowsWithoutIncome.push(buildIncomeRowFromShiftValues_(shiftRow.values || []));
  return rowsWithoutIncome;
}

function buildIncomeRowFromShiftValues_(values) {
  const closedAt = values[2] || new Date().toISOString();
  const shiftId = values[0] || "";
  const hasLegacyNetSalesColumn = values.length > 19;
  const thaiChuayThaiIndex = hasLegacyNetSalesColumn ? 17 : 16;
  const burgerQuantityIndex = hasLegacyNetSalesColumn ? 18 : 17;
  const bbqQuantityIndex = hasLegacyNetSalesColumn ? 19 : 18;
  return {
    tab: "รายรับ",
    values: [
      "INC-" + (shiftId || new Date().getTime()),
      formatSheetDate_(closedAt),
      closedAt,
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

function formatSheetDate_(value) {
  if (!value) return "";
  const text = String(value || "").trim();
  if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(text)) return text;
  if (/^\d{1,2}\/\d{1,2}\/\d{4}\s+\d{1,2}:\d{2}/.test(text)) return text.split(/\s+/)[0];
  const date = new Date(value);
  if (isNaN(date.getTime())) return String(value || "");
  return Utilities.formatDate(date, "Asia/Bangkok", "dd/MM/yyyy");
}

function formatSheetDateTime_(value) {
  if (!value) return "";
  const text = String(value || "").trim();
  if (/^\d{1,2}\/\d{1,2}\/\d{4}\s+\d{1,2}:\d{2}/.test(text)) return text;
  const date = new Date(value);
  if (isNaN(date.getTime())) return String(value || "");
  return Utilities.formatDate(date, "Asia/Bangkok", "dd/MM/yyyy HH:mm");
}

function runSheetOperations_(spreadsheet, operations) {
  const results = [];
  (operations || []).forEach(function(operation) {
    if (isRetiredMonthlyExpenseOperation_(operation)) {
      results.push({
        ok: true,
        type: operation.type,
        skipped: true,
        reason: "monthly expense tabs retired; use รายจ่าย table",
      });
      return;
    }
    results.push(runSheetOperation_(spreadsheet, operation));
  });
  return results;
}

function normalizeSheetOperations_(job, operations) {
  const currentOperations = (operations || []).filter(function(operation) {
    return !isRetiredMonthlyExpenseOperation_(operation);
  });
  if (job && job.type === "SHIFT_SUMMARY") {
    return currentOperations.filter(function(operation) {
      return !operation || operation.type !== "UPSERT_DAILY_REVENUE";
    });
  }
  return currentOperations;
}

function isRetiredMonthlyExpenseOperation_(operation) {
  return operation && (
    operation.type === "APPEND_MONTHLY_EXPENSE"
    || operation.type === "DELETE_MONTHLY_EXPENSE"
  );
}

function runSheetOperation_(spreadsheet, operation) {
  if (!operation || !operation.type) return { ok: false, error: "Missing operation type" };
  if (operation.type === "UPSERT_DAILY_REVENUE") {
    return upsertDailyRevenue_(spreadsheet, operation);
  }
  if (isRetiredMonthlyExpenseOperation_(operation)) {
    return {
      ok: true,
      type: operation.type,
      skipped: true,
      reason: "monthly expense tabs retired; use รายจ่าย table",
    };
  }
  if (operation.type === "DELETE_RAW_EXPENSE") {
    return deleteRawExpense_(spreadsheet, operation);
  }
  if (operation.type === "RESET_BURGER_POS_SHEET") {
    return resetBurgerPosSheet_(spreadsheet, operation);
  }
  return { ok: false, type: operation.type, error: "Unknown sheet operation" };
}

function upsertDailyRevenue_(spreadsheet, operation) {
  const sheet = getRequiredSheet_(spreadsheet, operation.monthTab);
  const day = Number(operation.day || 0);
  if (day < 1 || day > 31) throw new Error("Invalid revenue day: " + operation.day);
  const row = 4 + day; // day 1 = row 5
  sheet.getRange(row, 2, 1, 3).setValues([[
    operation.dateValue || day,
    Number(operation.cashSales || 0),
    Number(operation.transferSales || 0),
  ]]);
  return { ok: true, type: operation.type, tab: operation.monthTab, row: row };
}

function deleteRawExpense_(spreadsheet, operation) {
  const sheet = getExistingDataSheet_(spreadsheet, "รายจ่าย");
  if (!sheet || !operation.expenseId) return { ok: true, type: operation.type, deletedRows: 0 };
  const deletedRows = deleteRowsByColumnValues_(sheet, 1, [operation.expenseId]);
  return { ok: true, type: operation.type, deletedRows: deletedRows };
}

function deleteStockMovementRowsBySourceIds_(spreadsheet, sourceIds) {
  const sheet = spreadsheet.getSheetByName("Stock Movements");
  if (!sheet || !sourceIds || !sourceIds.length) return 0;
  return deleteRowsByColumnValues_(sheet, 12, sourceIds);
}

function deleteRowsByColumnValues_(sheet, column, targetValues) {
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return 0;
  const targets = {};
  targetValues.forEach(function(value) {
    targets[String(value || "")] = true;
  });
  const values = sheet.getRange(2, column, lastRow - 1, 1).getValues();
  let deletedRows = 0;
  for (let index = values.length - 1; index >= 0; index -= 1) {
    if (targets[String(values[index][0] || "")]) {
      sheet.deleteRow(index + 2);
      deletedRows += 1;
    }
  }
  return deletedRows;
}

function resetBurgerPosSheet_(spreadsheet, operation) {
  ["Sales", "รายรับ", "รายจ่าย", "Stock Movements", "Shift Summary"].forEach(function(tabName) {
    clearDataRows_(getExistingDataSheet_(spreadsheet, tabName));
  });
  clearDataRows_(getOrCreateAuditSheet_(spreadsheet));
  for (let month = 1; month <= 12; month += 1) {
    const sheet = spreadsheet.getSheetByName(String(month));
    if (!sheet) continue;
    sheet.getRange(5, 2, 31, 3).clearContent(); // B5:D35 daily cash / transfer
    const lastRow = Math.max(sheet.getLastRow(), 14);
    sheet.getRange(14, 12, lastRow - 13, 8).clearContent(); // L:S expense area + hidden meta
  }
  return { ok: true, type: operation.type, mode: operation.mode || "transactions" };
}

function clearDataRows_(sheet) {
  if (!sheet) return;
  const lastRow = sheet.getLastRow();
  const lastColumn = Math.max(sheet.getLastColumn(), 1);
  if (lastRow > 1) sheet.getRange(2, 1, lastRow - 1, lastColumn).clearContent();
}

function getRequiredSheet_(spreadsheet, tabName) {
  const sheet = getExistingDataSheet_(spreadsheet, tabName);
  if (!sheet) throw new Error("Missing sheet tab: " + tabName);
  return sheet;
}

function getOrCreateDataSheet_(spreadsheet, tabName) {
  const canonicalTabName = canonicalDataTabName_(tabName);
  if (canonicalTabName === "Audit Log") return getOrCreateAuditSheet_(spreadsheet);
  const headers = DATA_SHEET_HEADERS[canonicalTabName];
  let sheet = getExistingDataSheet_(spreadsheet, canonicalTabName);
  if (!sheet && headers) sheet = spreadsheet.insertSheet(canonicalTabName);
  if (!sheet) throw new Error("Missing sheet tab: " + canonicalTabName);
  if (sheet.getName() !== canonicalTabName && !spreadsheet.getSheetByName(canonicalTabName)) {
    sheet.setName(canonicalTabName);
  }
  if (headers) {
    if (sheet.getMaxColumns() < headers.length) {
      sheet.insertColumnsAfter(sheet.getMaxColumns(), headers.length - sheet.getMaxColumns());
    }
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function canonicalDataTabName_(tabName) {
  const name = String(tabName || "");
  return DATA_TAB_ALIASES[name] || name;
}

function getExistingDataSheet_(spreadsheet, tabName) {
  const canonicalTabName = canonicalDataTabName_(tabName);
  return spreadsheet.getSheetByName(canonicalTabName) || spreadsheet.getSheetByName(String(tabName || ""));
}

function getOrCreateAppStateSheet_(spreadsheet) {
  let sheet = spreadsheet.getSheetByName(APP_STATE_TAB);
  if (!sheet) {
    sheet = spreadsheet.insertSheet(APP_STATE_TAB);
  }
  if (sheet.getMaxColumns() < APP_STATE_HEADERS.length) {
    sheet.insertColumnsAfter(sheet.getMaxColumns(), APP_STATE_HEADERS.length - sheet.getMaxColumns());
  }
  sheet.getRange(1, 1, 1, APP_STATE_HEADERS.length).setValues([APP_STATE_HEADERS]);
  sheet.setFrozenRows(1);
  return sheet;
}

function buildAppStateIndex_(sheet) {
  const index = {};
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return index;
  const values = sheet.getRange(2, 1, lastRow - 1, 2).getValues();
  values.forEach(function(row, offset) {
    const storeId = String(row[0] || "");
    const key = String(row[1] || "");
    if (storeId && key) index[storeId + "\u0000" + key] = offset + 2;
  });
  return index;
}

function keyMap_(keys) {
  const map = {};
  keys.forEach(function(key) {
    map[String(key)] = true;
  });
  return map;
}

function getOrCreateAuditSheet_(spreadsheet) {
  const tabName = "Audit Log";
  let sheet = spreadsheet.getSheetByName(tabName);
  if (!sheet) {
    sheet = spreadsheet.insertSheet(tabName);
  }
  if (sheet.getLastRow() === 0) {
    sheet.appendRow([
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
    ]);
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function findFirstEmptyExpenseRow_(sheet) {
  const startRow = 14;
  const lastRow = Math.max(sheet.getLastRow(), startRow);
  const values = sheet.getRange(startRow, 12, lastRow - startRow + 1, 1).getValues();
  for (let index = 0; index < values.length; index += 1) {
    if (!values[index][0]) return startRow + index;
  }
  return lastRow + 1;
}

function findExpenseMetaRow_(sheet, expenseId, itemId) {
  if (!expenseId) return null;
  const startRow = 14;
  const lastRow = Math.max(sheet.getLastRow(), startRow);
  const values = sheet.getRange(startRow, 18, lastRow - startRow + 1, 2).getValues();
  for (let index = 0; index < values.length; index += 1) {
    const rowExpenseId = values[index][0];
    const rowItemId = values[index][1];
    if (rowExpenseId === expenseId && (!itemId || rowItemId === itemId)) return startRow + index;
  }
  return null;
}

function shiftExpenseBlockUp_(sheet, row) {
  const startCol = 12; // L
  const width = 8; // L:S, including hidden ids in R:S
  const lastRow = Math.max(sheet.getLastRow(), row);
  if (row < lastRow) {
    const below = sheet.getRange(row + 1, startCol, lastRow - row, width).getValues();
    sheet.getRange(row, startCol, below.length, width).setValues(below);
  }
  sheet.getRange(lastRow, startCol, 1, width).clearContent();
}

function sendLineMessage_(payload) {
  const props = PropertiesService.getScriptProperties();
  const token = props.getProperty("LINE_CHANNEL_ACCESS_TOKEN");
  if (!token) throw new Error("Missing LINE_CHANNEL_ACCESS_TOKEN");

  const targetId = payload.target === "shift"
    ? props.getProperty("LINE_TARGET_SHIFT")
    : props.getProperty("LINE_TARGET_STOCK");
  if (!targetId) throw new Error("Missing LINE target id for " + payload.target);

  const response = UrlFetchApp.fetch("https://api.line.me/v2/bot/message/push", {
    method: "post",
    contentType: "application/json",
    headers: { Authorization: "Bearer " + token },
    muteHttpExceptions: true,
    payload: JSON.stringify({
      to: targetId,
      messages: [{ type: "text", text: String(payload.message || "") }],
    }),
  });

  const code = response.getResponseCode();
  if (code < 200 || code >= 300) {
    throw new Error("LINE push failed " + code + ": " + response.getContentText());
  }
  return { ok: true, target: payload.target };
}

function parseJsonBody_(e) {
  const text = e && e.postData ? e.postData.contents : "{}";
  return JSON.parse(text || "{}");
}

function json_(value) {
  return ContentService
    .createTextOutput(JSON.stringify(value))
    .setMimeType(ContentService.MimeType.JSON);
}
