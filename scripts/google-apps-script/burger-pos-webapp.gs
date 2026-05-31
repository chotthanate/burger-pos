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
  rows.forEach((row) => {
    const sheet = spreadsheet.getSheetByName(row.tab);
    if (!sheet) throw new Error("Missing sheet tab: " + row.tab);
    sheet.appendRow(row.values || []);
  });
  return { ok: true, appendedRows: rows.length };
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
