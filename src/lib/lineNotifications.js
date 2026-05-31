import { money } from "./posLogic.js";

export function makeStockEditLineJob(movement) {
  const date = formatDateTime(movement.createdAt);
  const before = movement.quantityBefore ?? "-";
  const after = movement.quantityAfter ?? "-";
  const delta = Number(movement.quantityDelta || 0);
  const sign = delta > 0 ? "+" : "";
  return {
    type: "LINE_STOCK_EDIT",
    target: "stock",
    sourceId: movement.id,
    description: `LINE stock edit: ${movement.ingredientName}`,
    message: [
      "แจ้งเตือนแก้ไขสต็อก",
      `เวลา: ${date}`,
      `วัตถุดิบ: ${movement.ingredientName}`,
      `แก้จาก: ${before} ${movement.unit || ""}`,
      `เป็น: ${after} ${movement.unit || ""}`,
      `ส่วนต่าง: ${sign}${money(delta)} ${movement.unit || ""}`,
      `เหตุผล: ${movement.reason || "-"}`,
      `ที่มา: ${movement.sourceType || movement.type || "-"}`,
    ].join("\n"),
  };
}

export function makeShiftSummaryLineJob(shift, summary) {
  const closedAt = summary.closedAt || shift.closedAt || new Date().toISOString();
  return {
    type: "LINE_SHIFT_SUMMARY",
    target: "shift",
    sourceId: shift.id,
    description: `LINE shift summary: ${shift.id}`,
    message: [
      "สรุปปิดกะ BOY Burger",
      `เวลา: ${formatDateTime(closedAt)}`,
      `ยอดขายรวม: ${money(summary.totalSales)} บาท`,
      `เงินสด: ${money(summary.cashSales)} บาท`,
      `เงินโอน: ${money(summary.transferSales)} บาท`,
      `จำนวนออร์เดอร์: ${summary.orderCount || 0}`,
      `ยกเลิกออร์เดอร์: ${summary.voidOrderCount || 0}`,
      `ยอดยกเลิก: ${money(summary.voidAmount)} บาท`,
      `คืนเงินสด: ${money(summary.cashRefundAmount)} บาท`,
      `คืนเงินโอน: ${money(summary.transferRefundAmount)} บาท`,
      `เงินสดเริ่มต้น: ${money(summary.openingCash)} บาท`,
      `เงินสดที่ควรมี: ${money(summary.expectedCash)} บาท`,
      `เงินสดนับจริง: ${money(summary.closingCash)} บาท`,
      `ส่วนต่างเงินสด: ${money(summary.cashDifference)} บาท`,
    ].join("\n"),
  };
}

export async function sendLineNotificationJob(job, settings = {}) {
  const url = (settings.lineWebAppUrl || "").trim();
  if (!url) {
    throw new Error("ยังไม่ได้ตั้งค่า LINE Web App URL");
  }

  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify({
      action: "sendLineMessage",
      target: job.target,
      message: job.message,
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
    throw new Error(result?.error || result?.message || `LINE notification failed (${response.status})`);
  }

  return result || { ok: true };
}

function formatDateTime(value) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString("th-TH", {
    dateStyle: "medium",
    timeStyle: "medium",
  });
}
