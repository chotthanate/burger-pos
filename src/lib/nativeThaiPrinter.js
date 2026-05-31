import { Capacitor, registerPlugin } from "@capacitor/core";
import { getOrderDisplayNo } from "./orderFormat.js";
import { money } from "./posLogic.js";

const ThaiPrinter = registerPlugin("ThaiPrinter");
const PAPER_WIDTH_DOTS = 576;
const LOGO_URL = `${import.meta.env.BASE_URL}boy-burger-logo.png`;
const DEFAULT_BLUETOOTH_PRINT_OPTIONS = {
  timeoutMs: 20000,
  chunkSize: 256,
  chunkDelayMs: 24,
  finalDelayMs: 2200,
};

export function isNativeThaiPrinterAvailable() {
  return Capacitor.isNativePlatform?.() && Capacitor.getPlatform?.() === "android";
}

export async function printAndroidThaiPrototype({ type, host, port }) {
  if (!isNativeThaiPrinterAvailable()) {
    throw new Error("ฟังก์ชันทดสอบนี้ใช้ได้เฉพาะใน Android App");
  }
  const escposBytes = await buildThaiPrototypeEscPos(type);
  const result = await ThaiPrinter.printEscPos({
    host: String(host || "").trim(),
    port: Number(port || 9100),
    escposBase64: base64EncodeBytes(escposBytes),
    timeoutMs: 7000,
  });
  return result;
}

export async function getAndroidBluetoothPrinters() {
  if (!isNativeThaiPrinterAvailable()) {
    throw new Error("ฟังก์ชัน Bluetooth ใช้ได้เฉพาะใน Android App");
  }
  const result = await ThaiPrinter.getBluetoothPrinters();
  return Array.isArray(result?.devices) ? result.devices : [];
}

export async function printAndroidBluetoothThaiPrototype({ type, address }) {
  if (!isNativeThaiPrinterAvailable()) {
    throw new Error("ฟังก์ชันทดสอบนี้ใช้ได้เฉพาะใน Android App");
  }
  const escposBytes = await buildThaiPrototypeEscPos(type);
  const result = await ThaiPrinter.printBluetoothEscPos({
    address: String(address || "").trim(),
    escposBase64: base64EncodeBytes(escposBytes),
    timeoutMs: 20000,
    chunkSize: 256,
    chunkDelayMs: 24,
    finalDelayMs: 2200,
  });
  return result;
}

export async function printAndroidNativeJob(job, settings = {}) {
  if (!isNativeThaiPrinterAvailable()) {
    throw new Error("Native printer ใช้ได้เฉพาะใน Android App");
  }
  const escposBytes = await buildThaiJobEscPos(job, settings);
  const escposBase64 = base64EncodeBytes(escposBytes);
  if (settings.printerConnection === "BLUETOOTH_NATIVE") {
    return ThaiPrinter.printBluetoothEscPos({
      address: String(settings.bluetoothPrinterAddress || "").trim(),
      escposBase64,
      timeoutMs: Number(settings.bluetoothPrintTimeoutMs || DEFAULT_BLUETOOTH_PRINT_OPTIONS.timeoutMs),
      chunkSize: Number(settings.bluetoothPrintChunkSize || DEFAULT_BLUETOOTH_PRINT_OPTIONS.chunkSize),
      chunkDelayMs: Number(settings.bluetoothPrintChunkDelayMs || DEFAULT_BLUETOOTH_PRINT_OPTIONS.chunkDelayMs),
      finalDelayMs: Number(settings.bluetoothPrintFinalDelayMs || DEFAULT_BLUETOOTH_PRINT_OPTIONS.finalDelayMs),
    });
  }
  return ThaiPrinter.printEscPos({
    host: String(settings.printerIp || "").trim(),
    port: Number(settings.printerPort || 9100),
    escposBase64,
    timeoutMs: Number(settings.nativeTcpTimeoutMs || 10000),
  });
}

async function buildThaiPrototypeEscPos(type) {
  await document.fonts?.ready?.catch?.(() => undefined);
  const canvas = document.createElement("canvas");
  const width = PAPER_WIDTH_DOTS;
  const padding = 28;
  const rows = type === "RECEIPT" ? receiptRows() : kitchenRows();
  const height = type === "RECEIPT" ? 1120 : 980;
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) throw new Error("ไม่สามารถสร้างภาพใบพิมพ์ได้");

  context.fillStyle = "#fff";
  context.fillRect(0, 0, width, height);
  context.fillStyle = "#000";
  context.textBaseline = "top";

  let y = 18;
  const logo = await loadImage(LOGO_URL).catch(() => null);
  if (logo) {
    const logoMaxWidth = 150;
    const logoMaxHeight = 112;
    const scale = Math.min(logoMaxWidth / logo.width, logoMaxHeight / logo.height);
    const logoWidth = Math.round(logo.width * scale);
    const logoHeight = Math.round(logo.height * scale);
    context.drawImage(logo, Math.round((width - logoWidth) / 2), y, logoWidth, logoHeight);
    y += logoHeight + 14;
  } else {
    drawCenteredText(context, "BOY BURGER", y, 34, "bold");
    y += 46;
  }

  drawCenteredText(context, type === "RECEIPT" ? "ใบเสร็จรับเงิน" : "ใบออร์เดอร์", y, 34, "bold");
  y += 46;
  drawCenteredText(context, "หมายเลขคำสั่งซื้อ : #TEST-TH", y, 24, "normal");
  y += 34;
  drawCenteredText(context, formatThaiDate(new Date()), y, 24, "normal");
  y += 44;
  drawDivider(context, y);
  y += 22;

  rows.forEach((row) => {
    if (row.kind === "item") {
      y = drawItemRow(context, row, y, padding);
    } else if (row.kind === "modifier") {
      y = drawModifierRow(context, row.text, y, padding + 22);
    } else if (row.kind === "note") {
      y = drawNoteRow(context, row.text, y, padding + 22);
    }
  });

  y += 8;
  drawDivider(context, y);
  y += 24;

  if (type === "RECEIPT") {
    y = drawSummaryRow(context, "รวม", "233 บาท", y, padding, 34, "bold");
    y = drawSummaryRow(context, "ชำระด้วยเงินโอน", "", y, padding, 25, "normal");
  } else {
    drawCenteredText(context, "ส่งเข้าครัว", y, 31, "bold");
    y += 42;
  }

  drawCenteredText(context, "ทดสอบพิมพ์ภาษาไทย POS-8390", y + 16, 22, "normal");
  const usedHeight = Math.min(canvas.height, Math.ceil(y + 88));
  const cropped = cropCanvas(canvas, usedHeight);
  return [
    0x1b, 0x40,
    ...canvasToEscPosRaster(cropped),
    0x0a, 0x0a, 0x0a, 0x0a,
    0x1d, 0x56, 0x00,
  ];
}

async function buildThaiJobEscPos(job = {}, settings = {}) {
  await document.fonts?.ready?.catch?.(() => undefined);
  const type = job?.type || "KITCHEN";
  if (type === "SHIFT_SUMMARY") return buildThaiShiftSummaryEscPos(job, settings);
  const order = job?.order || {};
  const canvas = document.createElement("canvas");
  const width = settings.paperSize === "58mm" ? 384 : PAPER_WIDTH_DOTS;
  const padding = width === PAPER_WIDTH_DOTS ? 28 : 18;
  canvas.width = width;
  canvas.height = Math.max(1400, 260 + (order.items || []).length * 180);
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) throw new Error("ไม่สามารถสร้างภาพใบพิมพ์ได้");

  context.fillStyle = "#fff";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = "#000";
  context.textBaseline = "top";

  let y = 16;
  const logo = await loadImage(LOGO_URL).catch(() => null);
  if (logo) {
    const logoMaxWidth = width === PAPER_WIDTH_DOTS ? 150 : 110;
    const logoMaxHeight = width === PAPER_WIDTH_DOTS ? 112 : 82;
    const scale = Math.min(logoMaxWidth / logo.width, logoMaxHeight / logo.height);
    const logoWidth = Math.round(logo.width * scale);
    const logoHeight = Math.round(logo.height * scale);
    context.drawImage(logo, Math.round((width - logoWidth) / 2), y, logoWidth, logoHeight);
    y += logoHeight + 12;
  }

  drawCenteredText(context, type === "RECEIPT" ? "ใบเสร็จรับเงิน" : "ใบออร์เดอร์", y, width === PAPER_WIDTH_DOTS ? 34 : 29, "bold", width);
  y += width === PAPER_WIDTH_DOTS ? 44 : 38;
  drawCenteredText(context, `หมายเลขคำสั่งซื้อ : ${getOrderDisplayNo(order) || "-"}`, y, width === PAPER_WIDTH_DOTS ? 24 : 21, "normal", width);
  y += width === PAPER_WIDTH_DOTS ? 32 : 28;
  drawCenteredText(context, formatThaiDate(new Date(order.createdAt || Date.now())), y, width === PAPER_WIDTH_DOTS ? 24 : 21, "normal", width);
  y += width === PAPER_WIDTH_DOTS ? 42 : 35;
  if (order.paymentStatus === "VOIDED") {
    drawCenteredText(context, "ยกเลิกแล้ว", y, width === PAPER_WIDTH_DOTS ? 27 : 23, "bold", width);
    y += width === PAPER_WIDTH_DOTS ? 36 : 30;
  }
  drawDivider(context, y, width, padding);
  y += 24;

  for (const item of order.items || []) {
    y = drawOrderItem(context, item, y, padding, width, type === "RECEIPT");
  }

  y += 8;
  drawDivider(context, y, width, padding);
  y += 26;

  if (type === "RECEIPT") {
    y = drawSummaryRow(context, "รวม", `${money(order.totalAmount)} บาท`, y, padding, width === PAPER_WIDTH_DOTS ? 34 : 29, "bold", width);
    if (order.paymentMethod === "CASH") {
      y = drawSummaryRow(context, "รับเงิน", `${money(order.cashReceived)} บาท`, y, padding, width === PAPER_WIDTH_DOTS ? 25 : 22, "normal", width);
      y = drawSummaryRow(context, "เงินทอน", `${money(order.changeDue)} บาท`, y, padding, width === PAPER_WIDTH_DOTS ? 25 : 22, "normal", width);
    } else {
      y = drawSummaryRow(context, "ชำระด้วยเงินโอน", "", y, padding, width === PAPER_WIDTH_DOTS ? 25 : 22, "normal", width);
    }
  } else {
    drawCenteredText(context, "ส่งเข้าครัว", y, width === PAPER_WIDTH_DOTS ? 31 : 27, "bold", width);
    y += width === PAPER_WIDTH_DOTS ? 42 : 36;
  }

  if (order.note) {
    y += 8;
    y = drawWrappedText(context, `หมายเหตุทั้งออร์เดอร์: ${order.note}`, padding, y, width - padding * 2, width === PAPER_WIDTH_DOTS ? 24 : 21, "normal");
  }

  const usedHeight = Math.min(canvas.height, Math.ceil(y + 92));
  const cropped = cropCanvas(canvas, usedHeight);
  return [
    0x1b, 0x40,
    ...canvasToEscPosRaster(cropped),
    0x0a, 0x0a, 0x0a, 0x0a,
    0x1d, 0x56, 0x00,
  ];
}

async function buildThaiShiftSummaryEscPos(job = {}, settings = {}) {
  const summary = job.summary || {};
  const shift = job.shift || {};
  const width = settings.paperSize === "58mm" ? 384 : PAPER_WIDTH_DOTS;
  const padding = width === PAPER_WIDTH_DOTS ? 28 : 18;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = 1320;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) throw new Error("ไม่สามารถสร้างภาพใบปิดกะได้");

  context.fillStyle = "#fff";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = "#000";
  context.textBaseline = "top";

  let y = 16;
  const logo = await loadImage(LOGO_URL).catch(() => null);
  if (logo) {
    const logoMaxWidth = width === PAPER_WIDTH_DOTS ? 150 : 110;
    const logoMaxHeight = width === PAPER_WIDTH_DOTS ? 112 : 82;
    const scale = Math.min(logoMaxWidth / logo.width, logoMaxHeight / logo.height);
    const logoWidth = Math.round(logo.width * scale);
    const logoHeight = Math.round(logo.height * scale);
    context.drawImage(logo, Math.round((width - logoWidth) / 2), y, logoWidth, logoHeight);
    y += logoHeight + 12;
  }

  drawCenteredText(context, "ใบสรุปปิดกะ", y, width === PAPER_WIDTH_DOTS ? 34 : 29, "bold", width);
  y += width === PAPER_WIDTH_DOTS ? 44 : 38;
  drawCenteredText(context, formatThaiDate(new Date(summary.closedAt || shift.closedAt || Date.now())), y, width === PAPER_WIDTH_DOTS ? 24 : 21, "normal", width);
  y += width === PAPER_WIDTH_DOTS ? 42 : 35;
  drawDivider(context, y, width, padding);
  y += 24;

  const summaryRows = [
    ["ยอดขายก่อนยกเลิก", `${money(summary.grossSales || summary.totalSales || 0)} บาท`, "bold"],
    ["ยอดขายสุทธิ", `${money(summary.netSales || summary.totalSales || 0)} บาท`, "bold"],
    ["เงินสดขาย", `${money(summary.cashSales || 0)} บาท`, "normal"],
    ["เงินโอน", `${money(summary.transferSales || 0)} บาท`, "normal"],
    ["ออร์เดอร์สำเร็จ", `${summary.orderCount || 0}`, "normal"],
    ["ออร์เดอร์ยกเลิก", `${summary.voidOrderCount || 0}`, "normal"],
    ["ยอดยกเลิก", `${money(summary.voidAmount || 0)} บาท`, "normal"],
    ["คืนเงินสด", `${money(summary.cashRefundAmount || 0)} บาท`, "normal"],
    ["คืนเงินโอน", `${money(summary.transferRefundAmount || 0)} บาท`, "normal"],
  ];

  for (const [label, value, weight] of summaryRows) {
    y = drawSummaryRow(context, label, value, y, padding, width === PAPER_WIDTH_DOTS ? 26 : 22, weight, width);
  }

  y += 8;
  drawDivider(context, y, width, padding);
  y += 24;

  const cashRows = [
    ["เงินสดเริ่มต้น", `${money(summary.openingCash ?? shift.openingCash ?? 0)} บาท`],
    ["เงินสดที่ควรมี", `${money(summary.expectedCash || 0)} บาท`],
    ["เงินสดที่นับได้", `${money(summary.closingCash ?? shift.closingCash ?? 0)} บาท`],
    ["ส่วนต่างเงินสด", `${money(summary.cashDifference || 0)} บาท`],
  ];

  for (const [label, value] of cashRows) {
    y = drawSummaryRow(context, label, value, y, padding, width === PAPER_WIDTH_DOTS ? 26 : 22, "normal", width);
  }

  y += 10;
  drawDivider(context, y, width, padding);
  y += 28;
  drawCenteredText(context, "ปิดกะเรียบร้อย", y, width === PAPER_WIDTH_DOTS ? 29 : 25, "bold", width);
  y += width === PAPER_WIDTH_DOTS ? 42 : 36;

  const usedHeight = Math.min(canvas.height, Math.ceil(y + 92));
  const cropped = cropCanvas(canvas, usedHeight);
  return [
    0x1b, 0x40,
    ...canvasToEscPosRaster(cropped),
    0x0a, 0x0a, 0x0a, 0x0a,
    0x1d, 0x56, 0x00,
  ];
}

function drawOrderItem(context, item, y, x, width, includePrice) {
  const size = width === PAPER_WIDTH_DOTS ? 30 : 25;
  const lineHeight = width === PAPER_WIDTH_DOTS ? 39 : 33;
  const total = Number(item.unitPrice || 0) * Number(item.quantity || 0);
  const left = `${item.quantity}x ${item.name}`;
  const right = includePrice ? `${money(total)} บาท` : "";
  context.font = font(size, "bold");
  if (right) {
    const rightWidth = context.measureText(right).width;
    context.fillText(right, width - x - rightWidth, y);
    const leftMaxWidth = Math.max(160, width - x * 3 - rightWidth);
    y = drawWrappedText(context, left, x, y, leftMaxWidth, size, "bold", lineHeight);
  } else {
    y = drawWrappedText(context, left, x, y, width - x * 2, size, "bold", lineHeight);
  }

  for (const modifier of item.modifiers || []) {
    y = drawWrappedText(context, `- ${modifier}`, x + 26, y, width - x * 2 - 26, size - 4, "normal", lineHeight - 5);
  }
  if (item.note) {
    y = drawWrappedText(context, `หมายเหตุ: ${item.note}`, x + 26, y, width - x * 2 - 26, size - 5, "normal", lineHeight - 6);
  }
  return y + 8;
}

function receiptRows() {
  return [
    { kind: "item", qty: "1x", name: "เบอร์เกอร์หมู", price: "84 บาท" },
    { kind: "modifier", text: "- เพิ่มชีส" },
    { kind: "item", qty: "1x", name: "ชีสเบอร์เกอร์", price: "89 บาท" },
    { kind: "item", qty: "2x", name: "เบอร์เกอร์ไก่กรอบ", price: "0 บาท" },
    { kind: "note", text: "หมายเหตุ: ขอเกรียมๆ" },
    { kind: "item", qty: "1x", name: "เบอร์เกอร์ปลา", price: "60 บาท" },
  ];
}

function kitchenRows() {
  return [
    { kind: "item", qty: "1x", name: "เบอร์เกอร์หมู", price: "" },
    { kind: "modifier", text: "- เพิ่มชีส" },
    { kind: "modifier", text: "- ไม่ใส่ผัก" },
    { kind: "note", text: "หมายเหตุ: ขอเกรียมๆ" },
    { kind: "item", qty: "2x", name: "ชีสเบอร์เกอร์", price: "" },
    { kind: "modifier", text: "- เพิ่มหมู" },
  ];
}

function drawItemRow(context, row, y, x) {
  context.font = font(30, "bold");
  context.fillText(`${row.qty} ${row.name}`, x, y);
  if (row.price) {
    const width = context.measureText(row.price).width;
    context.fillText(row.price, PAPER_WIDTH_DOTS - x - width, y);
  }
  return y + 43;
}

function drawModifierRow(context, text, y, x) {
  context.font = font(25, "normal");
  context.fillText(text, x, y);
  return y + 34;
}

function drawNoteRow(context, text, y, x) {
  context.font = font(24, "normal");
  context.fillText(text, x, y);
  return y + 36;
}

function drawSummaryRow(context, left, right, y, x, size, weight, width = PAPER_WIDTH_DOTS) {
  context.font = font(size, weight);
  context.fillText(left, x, y);
  if (right) {
    const rightWidth = context.measureText(right).width;
    context.fillText(right, width - x - rightWidth, y);
  }
  return y + size + 13;
}

function drawCenteredText(context, text, y, size, weight, width = PAPER_WIDTH_DOTS) {
  context.font = font(size, weight);
  const textWidth = context.measureText(text).width;
  context.fillText(text, Math.round((width - textWidth) / 2), y);
}

function drawDivider(context, y, width = PAPER_WIDTH_DOTS, padding = 28) {
  context.fillStyle = "#000";
  context.fillRect(padding, y, width - padding * 2, 2);
}

function drawWrappedText(context, text, x, y, maxWidth, size, weight, lineHeight = Math.round(size * 1.35)) {
  context.font = font(size, weight);
  const lines = wrapText(context, text, maxWidth);
  lines.forEach((line, index) => {
    context.fillText(line, x, y + index * lineHeight);
  });
  return y + Math.max(1, lines.length) * lineHeight;
}

function wrapText(context, text, maxWidth) {
  const value = String(text || "");
  const lines = [];
  let current = "";
  for (const char of value) {
    const next = current + char;
    if (current && context.measureText(next).width > maxWidth) {
      lines.push(current);
      current = char;
    } else {
      current = next;
    }
  }
  if (current) lines.push(current);
  return lines.length ? lines : [""];
}

function font(size, weight) {
  return `${weight === "bold" ? 700 : 400} ${size}px "FC Iconic", "Noto Sans Thai", "Tahoma", sans-serif`;
}

function cropCanvas(source, height) {
  const canvas = document.createElement("canvas");
  canvas.width = source.width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  context.drawImage(source, 0, 0);
  return canvas;
}

function canvasToEscPosRaster(canvas) {
  const context = canvas.getContext("2d", { willReadFrequently: true });
  const { width, height } = canvas;
  const image = context.getImageData(0, 0, width, height);
  const widthBytes = Math.ceil(width / 8);
  const data = [];
  for (let y = 0; y < height; y += 1) {
    for (let xByte = 0; xByte < widthBytes; xByte += 1) {
      let byte = 0;
      for (let bit = 0; bit < 8; bit += 1) {
        const x = xByte * 8 + bit;
        if (x >= width) continue;
        if (isDarkPixel(image, width, x, y)) byte |= 0x80 >> bit;
      }
      data.push(byte);
    }
  }
  return [
    0x1d, 0x76, 0x30, 0x00,
    widthBytes & 0xff, (widthBytes >> 8) & 0xff,
    height & 0xff, (height >> 8) & 0xff,
    ...data,
  ];
}

function isDarkPixel(image, width, x, y) {
  const offset = (y * width + x) * 4;
  const red = image.data[offset];
  const green = image.data[offset + 1];
  const blue = image.data[offset + 2];
  const alpha = image.data[offset + 3];
  const luminance = 0.299 * red + 0.587 * green + 0.114 * blue;
  return alpha > 10 && luminance < 190;
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("โหลดโลโก้ไม่สำเร็จ"));
    image.src = src;
  });
}

function formatThaiDate(date) {
  return new Intl.DateTimeFormat("th-TH", {
    dateStyle: "short",
    timeStyle: "medium",
  }).format(date);
}

function base64EncodeBytes(bytes) {
  let binary = "";
  for (let index = 0; index < bytes.length; index += 1) {
    binary += String.fromCharCode(bytes[index]);
  }
  return btoa(binary);
}
