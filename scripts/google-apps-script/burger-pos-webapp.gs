const SHEET_ACTION_APPEND = "appendSheetSyncJob";
const LINE_ACTION_SEND = "sendLineMessage";

function doPost(e) {
  const payload = parseJsonBody_(e);
  if (payload.action === SHEET_ACTION_APPEND) {
    return json_(appendSheetSyncJob_(payload));
  }
  if (payload.action === LINE_ACTION_SEND) {
    return json_(sendLineMessage_(payload));
  }
  return json_({ ok: false, error: "Unknown action" });
}

function appendSheetSyncJob_(payload) {
  const spreadsheet = SpreadsheetApp.openById(payload.sheetId);
  const rows = payload.job && payload.job.rows ? payload.job.rows : [];
  const operations = payload.job && payload.job.operations ? payload.job.operations : [];
  rows.forEach((row) => {
    const sheet = spreadsheet.getSheetByName(row.tab);
    if (!sheet) throw new Error("Missing sheet tab: " + row.tab);
    sheet.appendRow(row.values || []);
  });
  const operationResults = operations.map((operation) => runSheetOperation_(spreadsheet, operation));
  return { ok: true, appendedRows: rows.length, operations: operationResults };
}

function runSheetOperation_(spreadsheet, operation) {
  if (!operation || !operation.type) return { ok: false, error: "Missing operation type" };
  if (operation.type === "UPSERT_DAILY_REVENUE") {
    return upsertDailyRevenue_(spreadsheet, operation);
  }
  if (operation.type === "APPEND_MONTHLY_EXPENSE") {
    return appendMonthlyExpense_(spreadsheet, operation);
  }
  if (operation.type === "DELETE_MONTHLY_EXPENSE") {
    return deleteMonthlyExpense_(spreadsheet, operation);
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

function appendMonthlyExpense_(spreadsheet, operation) {
  const sheet = getRequiredSheet_(spreadsheet, operation.monthTab);
  const row = findFirstEmptyExpenseRow_(sheet);
  const values = operation.values || [];
  const meta = operation.meta || [operation.expenseId || "", operation.itemId || ""];
  sheet.getRange(row, 12, 1, 8).setValues([[
    values[0] || "",
    values[1] || "",
    values[2] || "",
    Number(values[3] || 0),
    Number(values[4] || 0),
    Number(values[5] || 0),
    meta[0] || "",
    meta[1] || "",
  ]]);
  return { ok: true, type: operation.type, tab: operation.monthTab, row: row };
}

function deleteMonthlyExpense_(spreadsheet, operation) {
  const sheet = getRequiredSheet_(spreadsheet, operation.monthTab);
  const target = findExpenseMetaRow_(sheet, operation.expenseId, operation.itemId);
  if (!target) return { ok: true, type: operation.type, deleted: false };
  shiftExpenseBlockUp_(sheet, target);
  return { ok: true, type: operation.type, deleted: true, row: target };
}

function getRequiredSheet_(spreadsheet, tabName) {
  const sheet = spreadsheet.getSheetByName(String(tabName || ""));
  if (!sheet) throw new Error("Missing sheet tab: " + tabName);
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
