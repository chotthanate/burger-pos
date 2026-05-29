import { Capacitor, registerPlugin } from "@capacitor/core";

const ThaiPrinter = registerPlugin("ThaiPrinter");
const PAPER_WIDTH_DOTS = 576;
const LOGO_URL = `${import.meta.env.BASE_URL}boy-burger-logo.png`;

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

function drawSummaryRow(context, left, right, y, x, size, weight) {
  context.font = font(size, weight);
  context.fillText(left, x, y);
  if (right) {
    const width = context.measureText(right).width;
    context.fillText(right, PAPER_WIDTH_DOTS - x - width, y);
  }
  return y + size + 13;
}

function drawCenteredText(context, text, y, size, weight) {
  context.font = font(size, weight);
  const width = context.measureText(text).width;
  context.fillText(text, Math.round((PAPER_WIDTH_DOTS - width) / 2), y);
}

function drawDivider(context, y) {
  context.fillStyle = "#000";
  context.fillRect(28, y, PAPER_WIDTH_DOTS - 56, 2);
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
