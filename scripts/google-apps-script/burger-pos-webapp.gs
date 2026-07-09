const SHEET_ACTION_APPEND = "appendSheetSyncJob";
const LINE_ACTION_SEND = "sendLineMessage";
const DEFAULT_SHEET_ID = "1-JJ9u2NjqBrQtgrBb4sUsmwdV36GP25g-rJPrwv8mpI";
const DATA_SHEET_HEADERS = {
  "Income": [
    "income_id", "income_date", "closed_at", "shift_id", "cash_sales",
    "transfer_sales", "total_sales", "gross_sales", "void_amount",
    "cash_refund_amount", "transfer_refund_amount", "net_sales", "order_count",
  ],
  "Expenses": [
    "expense_id", "expense_date", "created_at", "ingredient_id", "item_name",
    "ingredient_name", "purchase_unit", "base_unit", "quantity", "unit_price",
    "line_total", "stock_quantity", "category", "subcategory", "note",
    "total_amount", "expense_type", "general_expense_item_id",
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
  if (payload.action === LINE_ACTION_SEND) {
    return json_(sendLineMessage_(payload));
  }
  return json_({ ok: false, error: "Unknown action" });
}

function appendSheetSyncJob_(payload) {
  const spreadsheet = SpreadsheetApp.openById(payload.sheetId);
  const rows = normalizeSheetRows_(payload.job || {});
  const operations = normalizeSheetOperations_(payload.job || {}, payload.job && payload.job.operations ? payload.job.operations : []);
  rows.forEach((row) => {
    const sheet = getOrCreateDataSheet_(spreadsheet, row.tab);
    sheet.appendRow(normalizeRowValuesForSheet_(row));
  });
  const operationResults = runSheetOperations_(spreadsheet, operations);
  return { ok: true, appendedRows: rows.length, operations: operationResults };
}

function normalizeRowValuesForSheet_(row) {
  const values = row && row.values ? row.values.slice() : [];
  if (row && row.tab === "Income" && /^\d{4}-\d{2}-\d{2}$/.test(String(values[1] || ""))) {
    const parts = String(values[1]).split("-").map(Number);
    values[1] = new Date(parts[0], parts[1] - 1, parts[2], 12, 0, 0);
  }
  return values;
}

function normalizeSheetRows_(job) {
  const rows = job && job.rows ? job.rows.slice() : [];
  if (!job || job.type !== "SHIFT_SUMMARY") return rows;
  const hasIncomeRow = rows.some(function(row) {
    return row && row.tab === "Income";
  });
  if (hasIncomeRow) return rows;
  const shiftRow = rows.find(function(row) {
    return row && row.tab === "Shift Summary" && row.values;
  });
  if (!shiftRow) return rows;
  rows.push(buildIncomeRowFromShiftValues_(shiftRow.values || []));
  return rows;
}

function buildIncomeRowFromShiftValues_(values) {
  const closedAt = values[2] || new Date().toISOString();
  const shiftId = values[0] || "";
  return {
    tab: "Income",
    values: [
      "INC-" + (shiftId || new Date().getTime()),
      formatSheetDate_(closedAt),
      closedAt,
      shiftId,
      Number(values[4] || 0),
      Number(values[5] || 0),
      Number(values[6] || 0),
      Number(values[11] || values[6] || 0),
      Number(values[13] || 0),
      Number(values[14] || 0),
      Number(values[15] || 0),
      Number(values[16] || values[6] || 0),
      Number(values[10] || 0),
    ],
  };
}

function formatSheetDate_(value) {
  const date = new Date(value);
  if (isNaN(date.getTime())) return String(value || "");
  return Utilities.formatDate(date, "Asia/Bangkok", "yyyy-MM-dd");
}

function runSheetOperations_(spreadsheet, operations) {
  const results = [];
  const monthlyExpenseGroups = {};

  (operations || []).forEach(function(operation) {
    if (operation && operation.type === "APPEND_MONTHLY_EXPENSE") {
      const monthTab = String(operation.monthTab || "");
      if (!monthlyExpenseGroups[monthTab]) monthlyExpenseGroups[monthTab] = [];
      monthlyExpenseGroups[monthTab].push(operation);
      return;
    }
    results.push(runSheetOperation_(spreadsheet, operation));
  });

  Object.keys(monthlyExpenseGroups).forEach(function(monthTab) {
    const group = monthlyExpenseGroups[monthTab];
    const sheet = getRequiredSheet_(spreadsheet, monthTab);
    const row = findFirstEmptyExpenseRow_(sheet);
    const values = group.map(function(operation) {
      return buildMonthlyExpenseValues_(operation);
    });
    sheet.getRange(row, 12, values.length, 8).setValues(values);
    group.forEach(function(operation, index) {
      results.push({
        ok: true,
        type: "APPEND_MONTHLY_EXPENSE",
        tab: monthTab,
        row: row + index,
        expenseId: operation.expenseId || "",
        itemId: operation.itemId || "",
      });
    });
  });

  return results;
}

function normalizeSheetOperations_(job, operations) {
  const currentOperations = operations || [];
  if (job && job.type === "SHIFT_SUMMARY") {
    return currentOperations.filter(function(operation) {
      return !operation || operation.type !== "UPSERT_DAILY_REVENUE";
    });
  }
  if (!job || job.type !== "EXPENSE") return currentOperations;
  const rows = job.rows || [];
  const expenseRows = rows.filter(function(row) {
    return row && row.tab === "Expenses" && row.values;
  });
  if (!expenseRows.length) return currentOperations;

  const otherOperations = currentOperations.filter(function(operation) {
    return !operation || operation.type !== "APPEND_MONTHLY_EXPENSE";
  });
  const rebuiltOperations = expenseRows.map(function(row, index) {
    return buildMonthlyExpenseOperationFromRow_(row, index, job);
  }).filter(function(operation) {
    return !!operation;
  });
  return otherOperations.concat(rebuiltOperations);
}

function buildMonthlyExpenseOperationFromRow_(row, index, job) {
  const values = row.values || [];
  const parsedDate = parseMonthlyExpenseDate_(values[1], values[2]);
  if (!parsedDate) return null;
  const expenseId = values[0] || job.sourceId || ("EXP-" + (index + 1));
  const itemId = expenseId + "-" + (index + 1);
  return {
    type: "APPEND_MONTHLY_EXPENSE",
    monthTab: String(parsedDate.month),
    expenseId: expenseId,
    itemId: itemId,
    values: [
      parsedDate.display,
      values[4] || values[5] || "",
      values[6] || values[7] || "",
      Number(values[8] || 0),
      Number(values[9] || 0),
      Number(values[10] || 0),
    ],
    meta: [expenseId, itemId],
  };
}

function parseMonthlyExpenseDate_(value, fallbackValue) {
  const source = value || fallbackValue || new Date();
  if (Object.prototype.toString.call(source) === "[object Date]" && !isNaN(source.getTime())) {
    return buildMonthlyExpenseDate_(source.getDate(), source.getMonth() + 1, source.getFullYear());
  }
  const text = String(source || "").trim();
  let match = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (match) {
    return buildMonthlyExpenseDate_(Number(match[3]), Number(match[2]), Number(match[1]));
  }
  match = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (match) {
    let year = Number(match[3]);
    if (year > 2400) year -= 543;
    return buildMonthlyExpenseDate_(Number(match[1]), Number(match[2]), year);
  }
  const parsed = new Date(source);
  if (!isNaN(parsed.getTime())) {
    return buildMonthlyExpenseDate_(parsed.getDate(), parsed.getMonth() + 1, parsed.getFullYear());
  }
  return null;
}

function buildMonthlyExpenseDate_(day, month, year) {
  if (!day || !month || !year) return null;
  const displayYear = year < 2400 ? year + 543 : year;
  return {
    day: day,
    month: month,
    display: pad2_(day) + "/" + pad2_(month) + "/" + displayYear,
  };
}

function pad2_(value) {
  return String(value).padStart(2, "0");
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

function appendMonthlyExpense_(spreadsheet, operation) {
  const sheet = getRequiredSheet_(spreadsheet, operation.monthTab);
  const row = findFirstEmptyExpenseRow_(sheet);
  sheet.getRange(row, 12, 1, 8).setValues([buildMonthlyExpenseValues_(operation)]);
  return { ok: true, type: operation.type, tab: operation.monthTab, row: row };
}

function buildMonthlyExpenseValues_(operation) {
  const values = operation.values || [];
  const meta = operation.meta || [operation.expenseId || "", operation.itemId || ""];
  return [
    values[0] || "",
    values[1] || "",
    values[2] || "",
    Number(values[3] || 0),
    Number(values[4] || 0),
    Number(values[5] || 0),
    meta[0] || "",
    meta[1] || "",
  ];
}

function deleteMonthlyExpense_(spreadsheet, operation) {
  const sheet = getRequiredSheet_(spreadsheet, operation.monthTab);
  const target = findExpenseMetaRow_(sheet, operation.expenseId, operation.itemId);
  if (!target) return { ok: true, type: operation.type, deleted: false };
  shiftExpenseBlockUp_(sheet, target);
  return { ok: true, type: operation.type, deleted: true, row: target };
}

function deleteRawExpense_(spreadsheet, operation) {
  const sheet = spreadsheet.getSheetByName("Expenses");
  if (!sheet || !operation.expenseId) return { ok: true, type: operation.type, deletedRows: 0 };
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return { ok: true, type: operation.type, deletedRows: 0 };
  const values = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
  let deletedRows = 0;
  for (let index = values.length - 1; index >= 0; index -= 1) {
    if (values[index][0] === operation.expenseId) {
      sheet.deleteRow(index + 2);
      deletedRows += 1;
    }
  }
  return { ok: true, type: operation.type, deletedRows: deletedRows };
}

function resetBurgerPosSheet_(spreadsheet, operation) {
  ["Sales", "Income", "Expenses", "Stock Movements", "Shift Summary"].forEach(function(tabName) {
    clearDataRows_(spreadsheet.getSheetByName(tabName));
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
  const sheet = spreadsheet.getSheetByName(String(tabName || ""));
  if (!sheet) throw new Error("Missing sheet tab: " + tabName);
  return sheet;
}

function getOrCreateDataSheet_(spreadsheet, tabName) {
  if (tabName === "Audit Log") return getOrCreateAuditSheet_(spreadsheet);
  const headers = DATA_SHEET_HEADERS[tabName];
  let sheet = spreadsheet.getSheetByName(tabName);
  if (!sheet && headers) sheet = spreadsheet.insertSheet(tabName);
  if (!sheet) throw new Error("Missing sheet tab: " + tabName);
  if (headers) {
    if (sheet.getMaxColumns() < headers.length) {
      sheet.insertColumnsAfter(sheet.getMaxColumns(), headers.length - sheet.getMaxColumns());
    }
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function getOrCreateAuditSheet_(spreadsheet) {
  const tabName = "Audit Log";
  let sheet = spreadsheet.getSheetByName(tabName);
  if (!sheet) {
    sheet = spreadsheet.insertSheet(tabName);
  }
  if (sheet.getLastRow() === 0) {
    sheet.appendRow([
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
