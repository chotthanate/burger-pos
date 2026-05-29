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
  const method = normalizeBridgeMethod(settings.bridgeMethod, bridgeUrl);
  const url = fillBridgeUrl(bridgeUrl, {
    data: body,
    ip: settings.printerIp || "",
    port: settings.printerPort || "9100",
    type: job?.type || "KITCHEN",
  });

  if (method === "RAWBT_WS") {
    await sendRawBtWebSocket(url, body);
    return true;
  }

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
      "X-Printer-Port": settings.printerPort || "9100",
      "X-Paper-Size": settings.paperSize || "80mm",
      "X-Printer-Model": settings.printerModel || "POS-8390",
    },
    body,
  });
  if (!response.ok) throw new Error(`Printer bridge returned ${response.status}`);
  return true;
}

export async function testPrintBridge(settings = {}) {
  const bridgeUrl = settings.bridgeUrl || "http://127.0.0.1:8080/print";
  const method = normalizeBridgeMethod(settings.bridgeMethod, bridgeUrl);
  if (method === "RAWBT_WS") {
    await openRawBtWebSocketWithFallback(fillBridgeUrl(bridgeUrl, {
      data: "",
      ip: settings.printerIp || "",
      port: settings.printerPort || "9100",
      type: "TEST",
    }), { closeImmediately: true });
    return true;
  }
  throw new Error("ตรวจสอบการเชื่อมต่อรองรับเฉพาะ RawBT WebSocket ในตอนนี้");
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
    .replaceAll("{port}", encodeURIComponent(values.port || "9100"))
    .replaceAll("{type}", encodeURIComponent(values.type || ""))
    .replaceAll("{data}", encodeURIComponent(values.data || ""));
}

function normalizeBridgeMethod(method, bridgeUrl) {
  if (/^wss?:\/\//i.test(String(bridgeUrl || ""))) return "RAWBT_WS";
  return method || "POST";
}

function sendRawBtWebSocket(url, body) {
  return openRawBtWebSocketWithFallback(url, { payload: body });
}

async function openRawBtWebSocketWithFallback(url, options = {}) {
  const candidates = makeRawBtCandidateUrls(url);
  const errors = [];
  for (const candidate of candidates) {
    try {
      await openRawBtWebSocket(candidate, options);
      return true;
    } catch (error) {
      errors.push(`${candidate}: ${formatBridgeError(error)}`);
    }
  }
  throw new Error(`เชื่อมต่อ RawBT WebSocket ไม่สำเร็จ ลองแล้ว ${candidates.join(", ")} ถ้ายังไม่ผ่านให้ลองเปลี่ยน URL เป็น ws://localhost:40213/ หรือ ws://IP-แท็บเล็ต:40213/`);
}

function openRawBtWebSocket(url, { closeImmediately = false, payload = "" } = {}) {
  return new Promise((resolve, reject) => {
    if (typeof WebSocket === "undefined") {
      reject(new Error("เบราว์เซอร์นี้ไม่รองรับ WebSocket"));
      return;
    }

    let settled = false;
    const timeout = window.setTimeout(() => {
      finish(false, "ไม่ตอบภายในเวลาที่กำหนด");
    }, 6500);

    let socket;
    try {
      socket = new WebSocket(url);
      socket.binaryType = "arraybuffer";
    } catch (error) {
      window.clearTimeout(timeout);
      reject(new Error(formatBridgeError(error)));
      return;
    }

    function finish(ok, message) {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeout);
      try {
        if (socket && socket.readyState === WebSocket.OPEN) {
          socket.close(1000, "Work complete");
        }
      } catch {
        // Closing errors do not matter after RawBT accepts the job.
      }
      if (ok) resolve(true);
      else reject(new Error(message));
    }

    socket.onopen = () => {
      if (closeImmediately) {
        finish(true);
        return;
      }
      try {
        socket.send(payload);
        finish(true);
      } catch (error) {
        finish(false, formatBridgeError(error));
      }
    };

    socket.onerror = () => {
      finish(false, "เปิด WebSocket ไม่ได้");
    };

    socket.onclose = (event) => {
      if (!settled && event.code !== 1000) {
        finish(false, `RawBT WebSocket ปิดการเชื่อมต่อ (${event.code || "unknown"})`);
      }
    };
  });
}

function makeRawBtCandidateUrls(url) {
  const rawUrl = String(url || "ws://127.0.0.1:40213/").trim();
  const candidates = [rawUrl];
  try {
    const parsed = new URL(rawUrl);
    if (parsed.protocol === "ws:" || parsed.protocol === "wss:") {
      if (parsed.hostname === "127.0.0.1") {
        parsed.hostname = "localhost";
        candidates.push(parsed.toString());
      } else if (parsed.hostname === "localhost") {
        parsed.hostname = "127.0.0.1";
        candidates.push(parsed.toString());
      }
    }
  } catch {
    // Keep the original URL so the caller still receives a useful error.
  }
  return [...new Set(candidates)];
}

function formatBridgeError(error) {
  return error instanceof Error ? error.message : String(error || "Printer bridge error");
}

function appendQuery(url, key, value) {
  const separator = url.includes("?") ? "&" : "?";
  return `${url}${separator}${encodeURIComponent(key)}=${encodeURIComponent(value)}`;
}

function formatDate(value) {
  return new Date(value || Date.now()).toLocaleString("th-TH", { dateStyle: "short", timeStyle: "medium" });
}
