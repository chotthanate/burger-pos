import { Capacitor, registerPlugin } from "@capacitor/core";
import { getOrderDisplayNo } from "./orderFormat.js";
import { money } from "./posLogic.js";

const ThaiPrinter = registerPlugin("ThaiPrinter");
const PAPER_WIDTH_DOTS = 576;
const LOGO_URL = `${import.meta.env.BASE_URL}boy-burger-logo.png`;
const BITMAP_TEXT_SCALE = 2;
const MAX_BITMAP_TEXT_SIZE = 104;
const DEFAULT_BLUETOOTH_PRINT_OPTIONS = {
  timeoutMs: 20000,
  chunkSize: 320,
  chunkDelayMs: 2,
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
    timeoutMs: DEFAULT_BLUETOOTH_PRINT_OPTIONS.timeoutMs,
    chunkSize: DEFAULT_BLUETOOTH_PRINT_OPTIONS.chunkSize,
    chunkDelayMs: DEFAULT_BLUETOOTH_PRINT_OPTIONS.chunkDelayMs,
    finalDelayMs: DEFAULT_BLUETOOTH_PRINT_OPTIONS.finalDelayMs,
  });
  return result;
}

export async function printAndroidBluetoothThaiCodePageSweep({ address, start = 0, end = 255 } = {}) {
  if (!isNativeThaiPrinterAvailable()) {
    throw new Error("ฟังก์ชันทดสอบนี้ใช้ได้เฉพาะใน Android App");
  }
  const escposBytes = buildThaiCodePageSweepEscPos({ start, end });
  return ThaiPrinter.printBluetoothEscPos({
    address: String(address || "").trim(),
    escposBase64: base64EncodeBytes(escposBytes),
    timeoutMs: DEFAULT_BLUETOOTH_PRINT_OPTIONS.timeoutMs,
    chunkSize: DEFAULT_BLUETOOTH_PRINT_OPTIONS.chunkSize,
    chunkDelayMs: DEFAULT_BLUETOOTH_PRINT_OPTIONS.chunkDelayMs,
    finalDelayMs: DEFAULT_BLUETOOTH_PRINT_OPTIONS.finalDelayMs,
  });
}

export async function printAndroidNativeJob(job, settings = {}) {
  if (!isNativeThaiPrinterAvailable()) {
    throw new Error("Native printer ใช้ได้เฉพาะใน Android App");
  }
  const mode = String(settings.nativeThaiRenderMode || "BITMAP").toUpperCase();
  if (settings.printerConnection === "BLUETOOTH_NATIVE" && mode === "BITMAP") {
    return ThaiPrinter.printBluetoothTextBitmap({
      address: String(settings.bluetoothPrinterAddress || "").trim(),
      lines: buildNativeTextBitmapLines(job, settings),
      paperWidthDots: settings.paperSize === "58mm" ? 384 : PAPER_WIDTH_DOTS,
      openCashDrawer: shouldOpenCashDrawer(job, settings),
      cashDrawerPin: normalizedCashDrawerPin(settings),
      timeoutMs: Number(settings.bluetoothPrintTimeoutMs || DEFAULT_BLUETOOTH_PRINT_OPTIONS.timeoutMs),
      chunkSize: Number(settings.bluetoothPrintChunkSize || DEFAULT_BLUETOOTH_PRINT_OPTIONS.chunkSize),
      chunkDelayMs: Number(settings.bluetoothPrintChunkDelayMs || DEFAULT_BLUETOOTH_PRINT_OPTIONS.chunkDelayMs),
      finalDelayMs: Math.max(1800, Number(settings.bluetoothPrintFinalDelayMs || DEFAULT_BLUETOOTH_PRINT_OPTIONS.finalDelayMs)),
    });
  }
  const escposBytes = shouldUseFastTextPrint(job, settings)
    ? buildFastThaiTextEscPos(job, settings)
    : await buildThaiJobEscPos(job, settings);
  const escposBase64 = base64EncodeBytes(escposBytes);
  if (settings.printerConnection === "BLUETOOTH_NATIVE") {
    return ThaiPrinter.printBluetoothEscPos({
      address: String(settings.bluetoothPrinterAddress || "").trim(),
      escposBase64,
      timeoutMs: Number(settings.bluetoothPrintTimeoutMs || DEFAULT_BLUETOOTH_PRINT_OPTIONS.timeoutMs),
      chunkSize: Number(settings.bluetoothPrintChunkSize || DEFAULT_BLUETOOTH_PRINT_OPTIONS.chunkSize),
      chunkDelayMs: Number(settings.bluetoothPrintChunkDelayMs || DEFAULT_BLUETOOTH_PRINT_OPTIONS.chunkDelayMs),
      finalDelayMs: Math.max(1800, Number(settings.bluetoothPrintFinalDelayMs || DEFAULT_BLUETOOTH_PRINT_OPTIONS.finalDelayMs)),
    });
  }
  return ThaiPrinter.printEscPos({
    host: String(settings.printerIp || "").trim(),
    port: Number(settings.printerPort || 9100),
    escposBase64,
    timeoutMs: Number(settings.nativeTcpTimeoutMs || 10000),
  });
}

export async function openAndroidCashDrawer(settings = {}) {
  if (!isNativeThaiPrinterAvailable()) {
    throw new Error("Native cash drawer ใช้ได้เฉพาะใน Android App");
  }
  const escposBytes = buildCashDrawerKickEscPos(settings);
  if (settings.printerConnection === "BLUETOOTH_NATIVE") {
    return ThaiPrinter.printBluetoothEscPos({
      address: String(settings.bluetoothPrinterAddress || "").trim(),
      escposBase64: base64EncodeBytes(escposBytes),
      timeoutMs: Number(settings.bluetoothPrintTimeoutMs || DEFAULT_BLUETOOTH_PRINT_OPTIONS.timeoutMs),
      chunkSize: 64,
      chunkDelayMs: 20,
      finalDelayMs: 1400,
    });
  }
  return ThaiPrinter.printEscPos({
    host: String(settings.printerIp || "").trim(),
    port: Number(settings.printerPort || 9100),
    escposBase64: base64EncodeBytes(escposBytes),
    timeoutMs: Number(settings.nativeTcpTimeoutMs || 10000),
  });
}

function shouldUseFastTextPrint(job = {}, settings = {}) {
  const mode = String(settings.nativeThaiRenderMode || "BITMAP").toUpperCase();
  const type = job?.type || "KITCHEN";
  return settings.experimentalThaiTextMode === true
    && mode !== "BITMAP"
    && ["KITCHEN", "RECEIPT", "SHIFT_SUMMARY"].includes(type);
}

function shouldOpenCashDrawer(job = {}, settings = {}) {
  return settings.cashDrawerEnabled !== false
    && job?.openCashDrawer === true
    && job?.order?.paymentMethod === "CASH"
    && job?.type !== "SHIFT_SUMMARY";
}

function normalizedCashDrawerPin(settings = {}) {
  return String(settings.cashDrawerPin || "0") === "1" ? 1 : 0;
}

function appendCashDrawerKick(bytes, settings = {}) {
  const primaryPin = normalizedCashDrawerPin(settings);
  appendCashDrawerKickForPin(bytes, primaryPin);
  appendCashDrawerKickForPin(bytes, primaryPin === 1 ? 0 : 1);
}

function appendCashDrawerKickForPin(bytes, pin = 0) {
  const normalizedPin = pin === 1 ? 1 : 0;
  bytes.push(0x1b, 0x70, normalizedPin, 0x64, 0xff);
  bytes.push(0x0a);
  bytes.push(0x10, 0x14, 0x01, normalizedPin, 0x08);
}

function buildCashDrawerKickEscPos(settings = {}) {
  const bytes = [0x1b, 0x40];
  appendCashDrawerKick(bytes, settings);
  return bytes;
}

function buildNativeTextBitmapLines(job = {}, settings = {}) {
  const type = job?.type || "KITCHEN";
  if (type === "SHIFT_SUMMARY") return buildNativeShiftSummaryLines(job, settings);
  const order = job?.order || {};
  return type === "RECEIPT"
    ? buildNativeReceiptLines(order, settings)
    : buildNativeKitchenLines(order, settings);
}

function line(text = "", options = {}) {
  const size = Number(options.size || 28);
  return {
    text: String(text ?? ""),
    align: options.align || "left",
    bold: Boolean(options.bold),
    size: Math.min(MAX_BITMAP_TEXT_SIZE, Math.round(size * BITMAP_TEXT_SCALE)),
    gap: Number(options.gap || 2),
  };
}

function divider(gap = 22) {
  return { divider: true, gap };
}

function buildNativeKitchenLines(order) {
  const lines = [
    line("ใบออร์เดอร์", { align: "center", bold: true, size: 34, gap: 4 }),
    line(getOrderDisplayNo(order) || "-", { align: "center", bold: true, size: 31 }),
    line(formatThaiDate(new Date(order.createdAt || Date.now())), { align: "center", size: 23, gap: 10 }),
  ];
  if (order.paymentStatus === "VOIDED") lines.push(line("ยกเลิกแล้ว", { align: "center", bold: true, size: 31, gap: 8 }));
  lines.push(divider());
  lines.push(...buildNativeOrderItemLines(order, { includePrice: false }));
  lines.push(divider());
  lines.push(line("ส่งเข้าครัว", { align: "center", bold: true, size: 31, gap: 10 }));
  if (order.note) {
    lines.push(divider(18));
    lines.push(line(`หมายเหตุทั้งออร์เดอร์: ${order.note}`, { size: 25, gap: 8 }));
  }
  return lines;
}

function buildNativeReceiptLines(order) {
  const lines = [
    line("ใบเสร็จรับเงิน", { align: "center", bold: true, size: 34, gap: 4 }),
    line(getOrderDisplayNo(order) || "-", { align: "center", bold: true, size: 31 }),
    line(formatThaiDate(new Date(order.createdAt || Date.now())), { align: "center", size: 23, gap: 10 }),
  ];
  if (order.paymentStatus === "VOIDED") lines.push(line("ยกเลิกแล้ว", { align: "center", bold: true, size: 31, gap: 8 }));
  lines.push(divider());
  lines.push(...buildNativeOrderItemLines(order, { includePrice: true }));
  lines.push(divider());
  lines.push(line(`รวม ${money(order.totalAmount)} บาท`, { align: "right", bold: true, size: 33, gap: 8 }));
  if (order.paymentMethod === "CASH") {
    lines.push(line(`รับเงิน ${money(order.cashReceived)} บาท`, { align: "right", size: 26 }));
    lines.push(line(`เงินทอน ${money(order.changeDue)} บาท`, { align: "right", size: 26, gap: 8 }));
  } else {
    lines.push(line(`ชำระด้วย${paymentMethodLabel(order.paymentMethod)}`, { align: "center", size: 26, gap: 8 }));
  }
  if (order.note) {
    lines.push(divider(18));
    lines.push(line(`หมายเหตุทั้งออร์เดอร์: ${order.note}`, { size: 25, gap: 8 }));
  }
  return lines;
}

function buildNativeOrderItemLines(order, { includePrice }) {
  const lines = [];
  for (const item of order.items || []) {
    const qty = Number(item.quantity || 0);
    const name = item.name || "-";
    const total = Number(item.unitPrice || 0) * qty;
    lines.push(line(`${qty}x ${name}`, { bold: true, size: 31, gap: includePrice ? 0 : 4 }));
    if (includePrice) lines.push(line(`${money(total)} บาท`, { align: "right", size: 25, gap: 5 }));
    for (const modifier of item.modifiers || []) {
      lines.push(line(`- ${modifier}`, { size: 25, gap: 1 }));
    }
    if (item.note) {
      lines.push(line(`หมายเหตุ: ${item.note}`, { size: 24, gap: 1 }));
    }
    lines.push(line("", { size: 14, gap: 0 }));
  }
  if (!lines.length) lines.push(line("ไม่มีรายการสินค้า", { align: "center", size: 26, gap: 10 }));
  return lines;
}

function buildNativeShiftSummaryLines(job = {}) {
  const summary = job.summary || {};
  const shift = job.shift || {};
  return [
    line("ใบสรุปปิดกะ", { align: "center", bold: true, size: 28, gap: 4 }),
    divider(),
    line(`เปิดกะ: ${formatThaiDate(new Date(summary.openedAt || shift.openedAt || Date.now()))}`, { size: 21, gap: 1 }),
    line(`ปิดกะ: ${formatThaiDate(new Date(summary.closedAt || shift.closedAt || Date.now()))}`, { size: 21, gap: 1 }),
    line(`ออร์เดอร์ทั้งหมด: ${summary.orderCount || 0}`, { size: 21, gap: 1 }),
    line(`เบอร์เกอร์: ${money(summary.burgerQuantity || 0)} ชิ้น`, { size: 21, gap: 1 }),
    line(`BBQ: ${money(summary.bbqQuantity || 0)} ชิ้น`, { size: 21, gap: 6 }),
    divider(),
    line(`ยอดขายรวม: ${money(summary.netSales || summary.totalSales || 0)} บาท`, { size: 22, bold: true, gap: 1 }),
    line(`เงินสด: ${money(summary.cashSales || 0)} บาท`, { size: 21, gap: 1 }),
    line(`เงินโอน: ${money(summary.transferSales || 0)} บาท`, { size: 21, gap: 1 }),
    line(`ไทยช่วยไทย: ${money(summary.thaiChuayThaiSales || 0)} บาท`, { size: 21, gap: 6 }),
    divider(),
    line(`เงินเริ่มต้น: ${money(summary.openingCash ?? shift.openingCash ?? 0)} บาท`, { size: 21, gap: 1 }),
    line(`เงินที่ควรมี: ${money(summary.expectedCash || 0)} บาท`, { size: 21, gap: 1 }),
    line(`เงินที่นับได้: ${money(summary.closingCash ?? shift.closingCash ?? 0)} บาท`, { size: 21, gap: 1 }),
    line(`ส่วนต่างเงินสด: ${money(summary.cashDifference || 0)} บาท`, { size: 21, gap: 6 }),
    divider(),
    line("ปิดกะเรียบร้อย", { align: "center", bold: true, size: 24, gap: 10 }),
  ];
}

function buildFastThaiTextEscPos(job = {}, settings = {}) {
  const type = job?.type || "KITCHEN";
  const columns = settings.paperSize === "58mm" ? 32 : 42;
  const bytes = [
    0x1b, 0x40,
    0x1b, 0x74, normalizedThaiCodePage(settings),
    0x1b, 0x32,
  ];

  if (type === "SHIFT_SUMMARY") {
    appendShiftSummaryText(bytes, job, columns);
  } else if (type === "RECEIPT") {
    appendReceiptText(bytes, job.order || {}, columns);
  } else {
    appendKitchenText(bytes, job.order || {}, columns);
  }

  if (shouldOpenCashDrawer(job, settings)) appendCashDrawerKick(bytes, settings);
  bytes.push(0x1b, 0x61, 0x00, 0x1b, 0x45, 0x00, 0x1d, 0x21, 0x00);
  bytes.push(0x0a, 0x0a, 0x0a, 0x0a, 0x1d, 0x56, 0x42, 0x03);
  return bytes;
}

function buildThaiCodePageSweepEscPos({ start = 0, end = 255 } = {}) {
  const first = Math.max(0, Math.min(255, Number(start) || 0));
  const last = Math.max(first, Math.min(255, Number(end) || 255));
  const bytes = [0x1b, 0x40, 0x1b, 0x32];
  appendAsciiLine(bytes, "THAI CODE PAGE SWEEP");
  appendAsciiLine(bytes, "Read the line where Thai is correct");
  appendAsciiLine(bytes, "Sample: ko kai kho khai test");
  appendAsciiLine(bytes, "------------------------------");
  for (let page = first; page <= last; page += 1) {
    bytes.push(0x1b, 0x74, page);
    appendAscii(bytes, `CP ${String(page).padStart(3, "0")}: `);
    bytes.push(...encodeThaiPrinterText("กขค ทดสอบภาษาไทย"));
    bytes.push(0x0a);
  }
  bytes.push(0x1b, 0x74, 0x00);
  bytes.push(0x0a, 0x0a, 0x0a, 0x0a, 0x1d, 0x56, 0x42, 0x03);
  return bytes;
}

function appendAsciiLine(bytes, text) {
  appendAscii(bytes, text);
  bytes.push(0x0a);
}

function appendAscii(bytes, text) {
  for (const char of String(text || "")) {
    const code = char.charCodeAt(0);
    bytes.push(code >= 0x20 && code <= 0x7e ? code : 0x3f);
  }
}

function appendKitchenText(bytes, order, columns) {
  appendPrinterLine(bytes, "ใบออร์เดอร์", { align: 1, bold: true });
  appendPrinterLine(bytes, getOrderDisplayNo(order) || "-", { align: 1, bold: true });
  appendPrinterLine(bytes, formatThaiDate(new Date(order.createdAt || Date.now())), { align: 1 });
  if (order.isTest) appendPrinterLine(bytes, "TEST MODE - NOT SAVED", { align: 1, bold: true });
  if (order.paymentStatus === "VOIDED") appendPrinterLine(bytes, "ยกเลิกแล้ว", { align: 1, bold: true });
  appendDividerLine(bytes, columns);
  appendOrderItemsText(bytes, order, columns, false);
  appendDividerLine(bytes, columns);
  appendPrinterLine(bytes, "ส่งเข้าครัว", { align: 1, bold: true });
  appendOrderNoteText(bytes, order, columns);
}

function appendReceiptText(bytes, order, columns) {
  appendPrinterLine(bytes, "ใบเสร็จรับเงิน", { align: 1, bold: true });
  appendPrinterLine(bytes, getOrderDisplayNo(order) || "-", { align: 1, bold: true });
  appendPrinterLine(bytes, formatThaiDate(new Date(order.createdAt || Date.now())), { align: 1 });
  if (order.isTest) appendPrinterLine(bytes, "TEST MODE - NOT SAVED", { align: 1, bold: true });
  if (order.paymentStatus === "VOIDED") appendPrinterLine(bytes, "ยกเลิกแล้ว", { align: 1, bold: true });
  appendDividerLine(bytes, columns);
  appendOrderItemsText(bytes, order, columns, true);
  appendDividerLine(bytes, columns);
  appendLabelValueLine(bytes, "รวม", `${money(order.totalAmount)} บาท`, columns, { bold: true });
  if (order.paymentMethod === "CASH") {
    appendLabelValueLine(bytes, "รับเงิน", `${money(order.cashReceived)} บาท`, columns);
    appendLabelValueLine(bytes, "เงินทอน", `${money(order.changeDue)} บาท`, columns);
  } else {
    appendPrinterLine(bytes, `ชำระด้วย${paymentMethodLabel(order.paymentMethod)}`, { align: 1 });
  }
  appendOrderNoteText(bytes, order, columns);
}

function appendShiftSummaryText(bytes, job, columns) {
  const summary = job.summary || {};
  const shift = job.shift || {};
  appendPrinterLine(bytes, "ใบสรุปปิดกะ", { align: 1, bold: true });
  appendDividerLine(bytes, columns);
  appendLabelValueLine(bytes, "เปิดกะ", formatThaiDate(new Date(summary.openedAt || shift.openedAt || Date.now())), columns);
  appendLabelValueLine(bytes, "ปิดกะ", formatThaiDate(new Date(summary.closedAt || shift.closedAt || Date.now())), columns);
  appendLabelValueLine(bytes, "ออร์เดอร์ทั้งหมด", `${summary.orderCount || 0}`, columns);
  appendLabelValueLine(bytes, "เบอร์เกอร์", `${money(summary.burgerQuantity || 0)} ชิ้น`, columns);
  appendLabelValueLine(bytes, "BBQ", `${money(summary.bbqQuantity || 0)} ชิ้น`, columns);
  appendDividerLine(bytes, columns);
  appendLabelValueLine(bytes, "ยอดขายรวม", `${money(summary.netSales || summary.totalSales || 0)} บาท`, columns, { bold: true });
  appendLabelValueLine(bytes, "เงินสด", `${money(summary.cashSales || 0)} บาท`, columns);
  appendLabelValueLine(bytes, "เงินโอน", `${money(summary.transferSales || 0)} บาท`, columns);
  appendLabelValueLine(bytes, "ไทยช่วยไทย", `${money(summary.thaiChuayThaiSales || 0)} บาท`, columns);
  appendDividerLine(bytes, columns);
  appendLabelValueLine(bytes, "เงินเริ่มต้น", `${money(summary.openingCash ?? shift.openingCash ?? 0)} บาท`, columns);
  appendLabelValueLine(bytes, "เงินที่ควรมี", `${money(summary.expectedCash || 0)} บาท`, columns);
  appendLabelValueLine(bytes, "เงินที่นับได้", `${money(summary.closingCash ?? shift.closingCash ?? 0)} บาท`, columns);
  appendLabelValueLine(bytes, "ส่วนต่างเงินสด", `${money(summary.cashDifference || 0)} บาท`, columns);
  appendDividerLine(bytes, columns);
  appendPrinterLine(bytes, "ปิดกะเรียบร้อย", { align: 1, bold: true });
}

function appendOrderItemsText(bytes, order, columns, includePrice) {
  for (const item of order.items || []) {
    const qty = Number(item.quantity || 0);
    const name = item.name || "-";
    const line = `${qty}x ${name}`;
    if (includePrice) {
      const total = Number(item.unitPrice || 0) * qty;
      appendWrappedPrinterLine(bytes, line, columns, { bold: true });
      appendLabelValueLine(bytes, "", `${money(total)} บาท`, columns);
    } else {
      appendWrappedPrinterLine(bytes, line, columns, { bold: true });
    }
    for (const modifier of item.modifiers || []) {
      appendWrappedPrinterLine(bytes, `  - ${modifier}`, columns);
    }
    if (item.note) {
      appendWrappedPrinterLine(bytes, `  หมายเหตุ: ${item.note}`, columns);
    }
  }
}

function appendOrderNoteText(bytes, order, columns) {
  if (!order.note) return;
  appendDividerLine(bytes, columns);
  appendWrappedPrinterLine(bytes, `หมายเหตุทั้งออร์เดอร์: ${order.note}`, columns);
}

function appendDividerLine(bytes, columns) {
  appendPrinterLine(bytes, "-".repeat(columns));
}

function appendLabelValueLine(bytes, label, value, columns, options = {}) {
  const left = String(label || "");
  const right = String(value || "");
  const leftWidth = printerTextWidth(left);
  const rightWidth = printerTextWidth(right);
  if (!left) {
    appendPrinterLine(bytes, right.padStart(Math.max(right.length, columns - 1)), options);
    return;
  }
  if (leftWidth + rightWidth + 1 <= columns) {
    appendPrinterLine(bytes, `${left}${" ".repeat(columns - leftWidth - rightWidth)}${right}`, options);
    return;
  }
  appendWrappedPrinterLine(bytes, left, columns, options);
  appendPrinterLine(bytes, right, { ...options, align: 2 });
}

function appendWrappedPrinterLine(bytes, text, columns, options = {}) {
  for (const line of wrapPrinterText(text, columns)) {
    appendPrinterLine(bytes, line, options);
  }
}

function appendPrinterLine(bytes, text = "", options = {}) {
  const align = Math.max(0, Math.min(Number(options.align || 0), 2));
  bytes.push(0x1b, 0x61, align);
  bytes.push(0x1b, 0x45, options.bold ? 0x01 : 0x00);
  bytes.push(0x1d, 0x21, options.double ? 0x11 : 0x00);
  bytes.push(...encodeThaiPrinterText(text), 0x0a);
}

function wrapPrinterText(text, columns) {
  const lines = [];
  let current = "";
  let width = 0;
  for (const char of String(text || "")) {
    const charWidth = printerTextWidth(char);
    if (current && width + charWidth > columns) {
      lines.push(current);
      current = char;
      width = charWidth;
    } else {
      current += char;
      width += charWidth;
    }
  }
  if (current || !lines.length) lines.push(current);
  return lines;
}

function printerTextWidth(text) {
  let width = 0;
  for (const char of String(text || "")) {
    const code = char.codePointAt(0);
    if ((code >= 0x0e31 && code <= 0x0e3a) || (code >= 0x0e47 && code <= 0x0e4e)) continue;
    width += code > 0x7f ? 1 : 1;
  }
  return width;
}

function encodeThaiPrinterText(text) {
  const bytes = [];
  for (const char of String(text || "")) {
    const code = char.codePointAt(0);
    if (code === 0x0a) {
      bytes.push(0x0a);
    } else if (code >= 0x20 && code <= 0x7e) {
      bytes.push(code);
    } else if (code >= 0x0e01 && code <= 0x0e5b) {
      bytes.push(code - 0x0e00 + 0xa0);
    } else {
      bytes.push(0x3f);
    }
  }
  return bytes;
}

function normalizedThaiCodePage(settings = {}) {
  const value = Number(settings.thaiCodePage || 20);
  if (value === 42) return 20;
  return Number.isFinite(value) && value >= 0 && value <= 255 ? value : 20;
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
    const logoHeight = drawReceiptLogo(context, logo, width, y, 200, 150);
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
    ...canvasToEscPosBitImage(cropped),
    0x0a, 0x0a, 0x0a, 0x0a,
    0x1d, 0x56, 0x42, 0x03,
  ];
}

async function buildThaiJobEscPos(job = {}, settings = {}) {
  await document.fonts?.ready?.catch?.(() => undefined);
  const type = job?.type || "KITCHEN";
  if (type === "SHIFT_SUMMARY") return buildThaiShiftSummaryEscPos(job, settings);
  const order = job?.order || {};
  const isTestPrint = Boolean(order.isTest || job.isTest);
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
    const logoHeight = drawReceiptLogo(
      context,
      logo,
      width,
      y,
      width === PAPER_WIDTH_DOTS ? 210 : 145,
      width === PAPER_WIDTH_DOTS ? 156 : 108,
    );
    y += logoHeight + 12;
  }

  drawCenteredText(context, type === "RECEIPT" ? "ใบเสร็จรับเงิน" : "ใบออร์เดอร์", y, width === PAPER_WIDTH_DOTS ? 34 : 29, "bold", width);
  y += width === PAPER_WIDTH_DOTS ? 44 : 38;
  drawCenteredText(context, `หมายเลขคำสั่งซื้อ : ${getOrderDisplayNo(order) || "-"}`, y, width === PAPER_WIDTH_DOTS ? 24 : 21, "normal", width);
  y += width === PAPER_WIDTH_DOTS ? 32 : 28;
  drawCenteredText(context, formatThaiDate(new Date(order.createdAt || Date.now())), y, width === PAPER_WIDTH_DOTS ? 24 : 21, "normal", width);
  y += width === PAPER_WIDTH_DOTS ? 42 : 35;
  if (isTestPrint) {
    drawCenteredText(context, "TEST MODE - NOT SAVED", y, width === PAPER_WIDTH_DOTS ? 25 : 22, "bold", width);
    y += width === PAPER_WIDTH_DOTS ? 36 : 30;
  }
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
      y = drawSummaryRow(context, `ชำระด้วย${paymentMethodLabel(order.paymentMethod)}`, "", y, padding, width === PAPER_WIDTH_DOTS ? 25 : 22, "normal", width);
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
  const bytes = [
    0x1b, 0x40,
    ...canvasToEscPosBitImage(cropped),
  ];
  if (shouldOpenCashDrawer(job, settings)) appendCashDrawerKick(bytes, settings);
  bytes.push(0x0a, 0x0a, 0x0a, 0x0a, 0x1d, 0x56, 0x42, 0x03);
  return bytes;
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
    const logoHeight = drawReceiptLogo(
      context,
      logo,
      width,
      y,
      width === PAPER_WIDTH_DOTS ? 210 : 145,
      width === PAPER_WIDTH_DOTS ? 156 : 108,
    );
    y += logoHeight + 12;
  }

  const titleSize = width === PAPER_WIDTH_DOTS ? 28 : 24;
  const rowSize = width === PAPER_WIDTH_DOTS ? 22 : 19;
  const smallRowSize = width === PAPER_WIDTH_DOTS ? 20 : 18;
  drawCenteredText(context, "ใบสรุปปิดกะ", y, titleSize, "bold", width);
  y += width === PAPER_WIDTH_DOTS ? 36 : 31;
  drawDivider(context, y, width, padding);
  y += 18;

  const firstSectionRows = [
    ["เปิดกะ", formatThaiDate(new Date(summary.openedAt || shift.openedAt || Date.now()))],
    ["ปิดกะ", formatThaiDate(new Date(summary.closedAt || shift.closedAt || Date.now()))],
    ["ออร์เดอร์ทั้งหมด", `${summary.orderCount || 0}`],
    ["เบอร์เกอร์", `${money(summary.burgerQuantity || 0)} ชิ้น`],
    ["BBQ", `${money(summary.bbqQuantity || 0)} ชิ้น`],
  ];

  for (const [label, value] of firstSectionRows) {
    y = drawSummaryRow(context, label, value, y, padding, smallRowSize, "normal", width);
  }

  y += 6;
  drawDivider(context, y, width, padding);
  y += 18;

  const salesRows = [
    ["ยอดขายรวม", `${money(summary.netSales || summary.totalSales || 0)} บาท`, "bold"],
    ["เงินสด", `${money(summary.cashSales || 0)} บาท`, "normal"],
    ["เงินโอน", `${money(summary.transferSales || 0)} บาท`, "normal"],
    ["ไทยช่วยไทย", `${money(summary.thaiChuayThaiSales || 0)} บาท`, "normal"],
  ];

  for (const [label, value, weight] of salesRows) {
    y = drawSummaryRow(context, label, value, y, padding, rowSize, weight, width);
  }

  y += 6;
  drawDivider(context, y, width, padding);
  y += 18;

  const cashRows = [
    ["เงินเริ่มต้น", `${money(summary.openingCash ?? shift.openingCash ?? 0)} บาท`],
    ["เงินที่ควรมี", `${money(summary.expectedCash || 0)} บาท`],
    ["เงินที่นับได้", `${money(summary.closingCash ?? shift.closingCash ?? 0)} บาท`],
    ["ส่วนต่างเงินสด", `${money(summary.cashDifference || 0)} บาท`],
  ];

  for (const [label, value] of cashRows) {
    y = drawSummaryRow(context, label, value, y, padding, rowSize, "normal", width);
  }

  y += 8;
  drawDivider(context, y, width, padding);
  y += 22;
  drawCenteredText(context, "ปิดกะเรียบร้อย", y, width === PAPER_WIDTH_DOTS ? 24 : 21, "bold", width);
  y += width === PAPER_WIDTH_DOTS ? 34 : 30;

  const usedHeight = Math.min(canvas.height, Math.ceil(y + 92));
  const cropped = cropCanvas(canvas, usedHeight);
  return [
    0x1b, 0x40,
    ...canvasToEscPosBitImage(cropped),
    0x0a, 0x0a, 0x0a, 0x0a,
    0x1d, 0x56, 0x42, 0x03,
  ];
}

function drawReceiptLogo(context, logo, width, y, maxWidth, maxHeight) {
  const scale = Math.min(maxWidth / logo.width, maxHeight / logo.height);
  const logoWidth = Math.max(1, Math.round(logo.width * scale));
  const logoHeight = Math.max(1, Math.round(logo.height * scale));
  context.save();
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  if ("filter" in context) {
    context.filter = "grayscale(1) contrast(1.55)";
  }
  context.drawImage(logo, Math.round((width - logoWidth) / 2), y, logoWidth, logoHeight);
  context.restore();
  return logoHeight;
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

function canvasToEscPosBitImage(canvas) {
  const context = canvas.getContext("2d", { willReadFrequently: true });
  const { width, height } = canvas;
  const image = context.getImageData(0, 0, width, height);
  const data = [0x1b, 0x33, 0x18];
  for (let y = 0; y < height; y += 24) {
    data.push(0x1b, 0x2a, 0x21, width & 0xff, (width >> 8) & 0xff);
    for (let x = 0; x < width; x += 1) {
      for (let slice = 0; slice < 3; slice += 1) {
        let byte = 0;
        for (let bit = 0; bit < 8; bit += 1) {
          const pixelY = y + slice * 8 + bit;
          if (pixelY < height && isDarkPixel(image, width, x, pixelY)) byte |= 0x80 >> bit;
        }
        data.push(byte);
      }
    }
    data.push(0x0a);
  }
  data.push(0x1b, 0x32);
  return data;
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

function paymentMethodLabel(method) {
  if (method === "THAI_CHUAY_THAI") return "ไทยช่วยไทย";
  if (method === "CASH") return "เงินสด";
  return "เงินโอน";
}

function base64EncodeBytes(bytes) {
  let binary = "";
  for (let index = 0; index < bytes.length; index += 1) {
    binary += String.fromCharCode(bytes[index]);
  }
  return btoa(binary);
}
