import { money } from "./posLogic.js";
import { getOrderDisplayNo } from "./orderFormat.js";

const encoder = typeof TextEncoder !== "undefined" ? new TextEncoder() : null;

export function buildPrintText(job, settings = {}) {
  const type = job?.type || "KITCHEN";
  const order = job?.order || {};
  return type === "RECEIPT" ? buildReceiptText(order, settings) : buildKitchenText(order, settings);
}

export async function sendPrintJob(job, settings = {}) {
  const body = buildPrintText(job, settings);
  const bridgeUrl = settings.bridgeUrl || "http://127.0.0.1:8080/print";
  const method = settings.bridgeMethod || "POST";
  const url = fillBridgeUrl(bridgeUrl, { data: body, ip: settings.printerIp || "", type: job?.type || "KITCHEN" });

  if (method === "GET") {
    const finalUrl = bridgeUrl.includes("{data}") ? url : appendQuery(url, "data", body);
    const response = await fetch(finalUrl, { method: "GET" });
    if (!response.ok) throw new Error(`Printer bridge returned ${response.status}`);
    return true;
  }

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "text/plain;charset=utf-8",
      "X-Printer-IP": settings.printerIp || "",
      "X-Paper-Size": settings.paperSize || "80mm",
    },
    body,
  });
  if (!response.ok) throw new Error(`Printer bridge returned ${response.status}`);
  return true;
}

export function makePrinterTestJob() {
  return {
    id: `TEST-${Date.now()}`,
    type: "RECEIPT",
    order: {
      id: `ORD-${Date.now()}`,
      orderNo: "#TEST",
      createdAt: new Date().toISOString(),
      paymentMethod: "CASH",
      totalAmount: 1,
      cashReceived: 1,
      changeDue: 0,
      items: [
        {
          name: "ทดสอบเครื่องพิมพ์",
          quantity: 1,
          unitPrice: 1,
          modifiers: ["เชื่อมต่อสำเร็จ"],
        },
      ],
    },
  };
}

function buildKitchenText(order) {
  const lines = [
    "\x1b@",
    "\x1ba\x01",
    "\x1b!\x10ใบออร์เดอร์\x1b!\x00",
    getOrderDisplayNo(order),
    formatDate(order.createdAt),
    "------------------------------",
    "\x1ba\x00",
    ...buildItemLines(order, { includePrice: false }),
    "------------------------------",
    "ส่งเข้าครัว",
    "\n\n\n\x1dV\x00",
  ];
  return lines.join("\n");
}

function buildReceiptText(order) {
  const lines = [
    "\x1b@",
    "\x1ba\x01",
    "\x1b!\x10ใบเสร็จรับเงิน\x1b!\x00",
    getOrderDisplayNo(order),
    formatDate(order.createdAt),
    "------------------------------",
    "\x1ba\x00",
    ...buildItemLines(order, { includePrice: true }),
    "------------------------------",
    alignLine("รวม", `${money(order.totalAmount)} บาท`),
    order.paymentMethod === "CASH" ? alignLine("รับเงิน", `${money(order.cashReceived)} บาท`) : "ชำระด้วยเงินโอน",
    order.paymentMethod === "CASH" ? alignLine("เงินทอน", `${money(order.changeDue)} บาท`) : "",
    "\n\n\n\x1dV\x00",
  ].filter(Boolean);
  return lines.join("\n");
}

function buildItemLines(order, { includePrice }) {
  return (order.items || []).flatMap((item) => {
    const total = Number(item.unitPrice || 0) * Number(item.quantity || 0);
    const firstLine = includePrice
      ? alignLine(`${item.quantity}x ${item.name}`, `${money(total)} บาท`)
      : `${item.quantity}x ${item.name}`;
    const modifiers = (item.modifiers || []).map((modifier) => `  - ${modifier}`);
    const note = item.note ? [`  หมายเหตุ: ${item.note}`] : [];
    return [firstLine, ...modifiers, ...note];
  });
}

function alignLine(left, right, width = 32) {
  const cleanLeft = String(left || "");
  const cleanRight = String(right || "");
  const spaces = Math.max(1, width - visibleLength(cleanLeft) - visibleLength(cleanRight));
  return `${cleanLeft}${" ".repeat(spaces)}${cleanRight}`;
}

function visibleLength(text) {
  if (!encoder) return String(text).length;
  return Math.ceil(encoder.encode(String(text)).length / 2);
}

function fillBridgeUrl(url, values) {
  return url
    .replaceAll("{ip}", encodeURIComponent(values.ip || ""))
    .replaceAll("{type}", encodeURIComponent(values.type || ""))
    .replaceAll("{data}", encodeURIComponent(values.data || ""));
}

function appendQuery(url, key, value) {
  const separator = url.includes("?") ? "&" : "?";
  return `${url}${separator}${encodeURIComponent(key)}=${encodeURIComponent(value)}`;
}

function formatDate(value) {
  return new Date(value || Date.now()).toLocaleString("th-TH", { dateStyle: "short", timeStyle: "medium" });
}
