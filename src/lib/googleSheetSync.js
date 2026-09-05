import { normalizeSheetJobForSync } from "./sheetExport.js";

export async function sendSheetSyncJob(job, settings = {}) {
  return postSheetSyncJob(normalizeSheetJobForSync(job), settings);
}

export async function sendSheetSyncJobs(jobs, settings = {}) {
  const normalizedJobs = (jobs || []).map(normalizeSheetJobForSync).filter(Boolean);
  if (!normalizedJobs.length) return { ok: true, appendedRows: 0 };
  const rows = normalizedJobs.flatMap((job) => Array.isArray(job.rows) ? job.rows : []);
  const operations = normalizedJobs.flatMap((job) => Array.isArray(job.operations) ? job.operations : []);
  const batchIdentity = normalizedJobs.map((job) => job.syncId || job.id || job.sourceId || "unknown").join("|");
  return postSheetSyncJob({
    type: "BATCH",
    syncId: `SYNC-BATCH-${stableHash(batchIdentity)}`,
    sourceId: normalizedJobs.map((job) => job.sourceId).filter(Boolean).join(","),
    description: `${normalizedJobs.length} queued jobs`,
    targetTabs: Array.from(new Set(rows.map((row) => row.tab).filter(Boolean))),
    rows,
    operations,
  }, settings);
}

async function postSheetSyncJob(normalizedJob, settings = {}) {
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
      job: normalizedJob,
    }),
  });

  const text = await response.text();
  let result = null;
  try {
    result = text ? JSON.parse(text) : null;
  } catch {
    throw new Error("Google Apps Script ตอบกลับไม่ถูกต้อง กรุณาตรวจ URL และสิทธิ์ Web App");
  }

  if (!response.ok || result?.ok !== true) {
    throw new Error(result?.error || result?.message || `Google Sheet sync failed (${response.status})`);
  }

  return result || { ok: true };
}

function stableHash(value) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}
