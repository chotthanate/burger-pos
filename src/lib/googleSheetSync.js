export async function sendSheetSyncJob(job, settings = {}) {
  const url = (settings.sheetWebAppUrl || "").trim();
  if (!url) {
    throw new Error("ยังไม่ได้ตั้งค่า Google Apps Script Web App URL");
  }

  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify({
      action: "appendSheetSyncJob",
      sheetId: settings.sheetId,
      job,
    }),
  });

  const text = await response.text();
  let result = null;
  try {
    result = text ? JSON.parse(text) : null;
  } catch {
    result = { ok: response.ok, message: text };
  }

  if (!response.ok || result?.ok === false) {
    throw new Error(result?.error || result?.message || `Google Sheet sync failed (${response.status})`);
  }

  return result || { ok: true };
}
