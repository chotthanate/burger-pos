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

  if (method === "RAWBT_INTENT") {
    launchRawBtIntent(body, settings);
    return true;
  }

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
  if (method === "RAWBT_INTENT") {
    launchRawBtIntent("ทดสอบเครื่องพิมพ์\nRawBT Android\nภาษาไทยควรอ่านได้\nเบอร์เกอร์ 1 ชิ้น 69 บาท", settings);
    return true;
  }
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

export async function printThaiCodePageTest(settings = {}) {
  const bridgeUrl = settings.bridgeUrl || "http://127.0.0.1:8080/print";
  const method = normalizeBridgeMethod(settings.bridgeMethod, bridgeUrl);
  if (method !== "RAWBT_INTENT") {
    throw new Error("ทดสอบภาษาไทยใช้กับ Android RawBT Intent เท่านั้น");
  }
  launchRawBtIntent("ทดสอบภาษาไทยแบบรูปภาพ\nใบเสร็จ เบอร์เกอร์ ราคา 123 บาท\nเงินทอน 7 บาท\nถ้าบรรทัดนี้อ่านได้ แปลว่าใช้โหมด Bitmap สำเร็จ", settings);
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

function buildKitchenText(order, settings = {}) {
  const lines = [
    ...buildPrinterPrefix(settings),
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

function buildReceiptText(order, settings = {}) {
  const lines = [
    ...buildPrinterPrefix(settings),
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
  if (method === "RAWBT_INTENT") return "RAWBT_INTENT";
  if (/^wss?:\/\//i.test(String(bridgeUrl || ""))) return "RAWBT_WS";
  return method || "POST";
}

function launchRawBtIntent(body, settings = {}) {
  if (typeof window === "undefined") {
    throw new Error("RawBT Android Intent ใช้ได้เฉพาะในเบราว์เซอร์บน Android");
  }
  const encoded = base64EncodeBytes(buildBitmapEscPosBytes(body, settings));
  window.location.href = `rawbt:base64,${encoded}`;
}

function base64EncodeBytes(bytes) {
  let binary = "";
  for (let index = 0; index < bytes.length; index += 1) {
    binary += String.fromCharCode(bytes[index]);
  }
  return btoa(binary);
}

function buildBitmapEscPosBytes(text, settings = {}) {
  if (typeof document === "undefined") return encodeEscPosText(text);
  const width = settings.paperSize === "58mm" ? 384 : 384;
  const paddingX = 16;
  const paddingY = 14;
  const fontSize = settings.paperSize === "58mm" ? 24 : 26;
  const lineHeight = Math.round(fontSize * 1.45);
  const printableWidth = width - paddingX * 2;
  const probe = document.createElement("canvas");
  const probeContext = probe.getContext("2d");
  if (!probeContext) return encodeEscPosText(text);
  probeContext.font = `${fontSize}px "FC Iconic", system-ui, sans-serif`;
  const lines = wrapBitmapText(stripEscPosCommands(text), probeContext, printableWidth);
  const height = Math.max(96, paddingY * 2 + lines.length * lineHeight);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) return encodeEscPosText(text);
  context.fillStyle = "#fff";
  context.fillRect(0, 0, width, height);
  context.fillStyle = "#000";
  context.textBaseline = "top";
  context.font = `${fontSize}px "FC Iconic", system-ui, sans-serif`;
  lines.forEach((line, index) => {
    const y = paddingY + index * lineHeight;
    context.fillText(line, paddingX, y);
  });
  const image = context.getImageData(0, 0, width, height);
  const raster = imageDataToEscStarBytes(image, width, height);
  return [
    0x1b, 0x40,
    ...raster,
    0x0a, 0x0a, 0x0a,
    0x1d, 0x56, 0x00,
  ];
}

function wrapBitmapText(text, context, maxWidth) {
  const output = [];
  String(text || "").split(/\r?\n/).forEach((rawLine) => {
    const line = rawLine.trimEnd();
    if (!line) {
      output.push("");
      return;
    }
    let current = "";
    for (const char of line) {
      const next = current + char;
      if (current && context.measureText(next).width > maxWidth) {
        output.push(current);
        current = char;
      } else {
        current = next;
      }
    }
    output.push(current);
  });
  return output;
}

function stripEscPosCommands(value) {
  const text = String(value || "");
  let output = "";
  for (let index = 0; index < text.length; index += 1) {
    const code = text.charCodeAt(index);
    if (code === 0x1b) {
      index += 2;
      continue;
    }
    if (code === 0x1d) {
      index += 2;
      continue;
    }
    output += text[index];
  }
  return output.replace(/\n{4,}/g, "\n\n");
}

function imageDataToEscStarBytes(image, width, height) {
  const bytes = [];
  const columns = width;
  const nL = columns & 0xff;
  const nH = (columns >> 8) & 0xff;
  for (let y = 0; y < height; y += 24) {
    bytes.push(0x1b, 0x2a, 0x21, nL, nH);
    for (let x = 0; x < columns; x += 1) {
      for (let slice = 0; slice < 3; slice += 1) {
        let byte = 0;
        for (let bit = 0; bit < 8; bit += 1) {
          const pixelY = y + slice * 8 + bit;
          if (pixelY >= height) continue;
          if (isDarkPixel(image, width, x, pixelY)) byte |= 0x80 >> bit;
        }
        bytes.push(byte);
      }
    }
    bytes.push(0x0a);
  }
  return bytes;
}

function isDarkPixel(image, width, x, y) {
  const offset = (y * width + x) * 4;
  const r = image.data[offset];
  const g = image.data[offset + 1];
  const b = image.data[offset + 2];
  const alpha = image.data[offset + 3];
  const luminance = 0.299 * r + 0.587 * g + 0.114 * b;
  return alpha > 10 && luminance < 190;
}

function buildPrinterPrefix(settings = {}) {
  const codePage = Number(settings.thaiCodePage || 42);
  return [
    "\x1b@",
    `\x1bt${String.fromCharCode(codePage)}`,
  ];
}

function buildThaiCodePageTestText() {
  const pages = [20, 21, 26, 42, 47];
  const lines = ["\x1b@", "\x1ba\x01", "ทดสอบภาษาไทย", "Thai code page test", "------------------------------"];
  for (const page of pages) {
    lines.push(`\x1bt${String.fromCharCode(page)}`);
    lines.push(`PAGE ${page}: ทดสอบ ใบเสร็จ เบอร์เกอร์`);
    lines.push(`PAGE ${page}: ราคา 123 บาท เงินทอน 7 บาท`);
    lines.push("------------------------------");
  }
  lines.push("\n\n\n\x1dV\x00");
  return lines.join("\n");
}

function encodeEscPosText(value) {
  const bytes = [];
  for (const char of value) {
    const code = char.codePointAt(0);
    if (code <= 0x7f) {
      bytes.push(code);
    } else if (code >= 0x0e01 && code <= 0x0e5b) {
      bytes.push(code - 0x0d60);
    } else {
      bytes.push(0x3f);
    }
  }
  return bytes;
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
