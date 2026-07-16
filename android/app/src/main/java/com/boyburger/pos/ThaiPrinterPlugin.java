package com.boyburger.pos;

import android.Manifest;
import android.bluetooth.BluetoothAdapter;
import android.bluetooth.BluetoothDevice;
import android.bluetooth.BluetoothGatt;
import android.bluetooth.BluetoothGattCallback;
import android.bluetooth.BluetoothGattCharacteristic;
import android.bluetooth.BluetoothGattService;
import android.bluetooth.BluetoothProfile;
import android.bluetooth.BluetoothSocket;
import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.Paint;
import android.graphics.Typeface;
import android.os.Build;
import android.util.Base64;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.OutputStream;
import java.lang.reflect.Method;
import java.net.InetSocketAddress;
import java.net.Socket;
import java.util.ArrayList;
import java.util.List;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicReference;

@CapacitorPlugin(
        name = "ThaiPrinter",
        permissions = {
                @Permission(alias = "bluetooth", strings = { Manifest.permission.BLUETOOTH_CONNECT, Manifest.permission.BLUETOOTH_SCAN })
        }
)
public class ThaiPrinterPlugin extends Plugin {
    private static final UUID SERIAL_PORT_PROFILE_UUID = UUID.fromString("00001101-0000-1000-8000-00805F9B34FB");
    private static final int BLE_CONNECT_TIMEOUT_MS = 12000;
    private static final int BLE_DEFAULT_MTU = 23;
    private static final int BLE_TARGET_MTU = 185;
    private static final int BITMAP_TRAILING_MARGIN_DOTS = 52;
    private static final int PRINT_TAIL_FEED_LINES = 4;
    private Typeface thaiRegularTypeface;
    private Typeface thaiBoldTypeface;

    @PluginMethod
    public void printEscPos(PluginCall call) {
        String host = call.getString("host", "").trim();
        Integer portValue = call.getInt("port", 9100);
        Integer timeoutValue = call.getInt("timeoutMs", 7000);
        String escposBase64 = call.getString("escposBase64", "");

        if (host.isEmpty()) {
            call.reject("กรุณากรอก IP เครื่องพิมพ์");
            return;
        }
        if (escposBase64.isEmpty()) {
            call.reject("ไม่มีข้อมูลใบพิมพ์");
            return;
        }

        int port = portValue == null ? 9100 : portValue;
        int timeoutMs = timeoutValue == null ? 7000 : timeoutValue;

        new Thread(() -> {
            try {
                byte[] payload = Base64.decode(escposBase64, Base64.DEFAULT);
                try (Socket socket = new Socket()) {
                    socket.connect(new InetSocketAddress(host, port), timeoutMs);
                    socket.setSoTimeout(timeoutMs);
                    OutputStream output = socket.getOutputStream();
                    output.write(payload);
                    output.flush();
                }

                JSObject result = new JSObject();
                result.put("bytesWritten", payload.length);
                getActivity().runOnUiThread(() -> call.resolve(result));
            } catch (Exception error) {
                getActivity().runOnUiThread(() -> call.reject("ส่งงานพิมพ์ไม่สำเร็จ: " + error.getMessage(), error));
            }
        }).start();
    }

    @PluginMethod
    public void getBluetoothPrinters(PluginCall call) {
        if (!hasBluetoothPermission()) {
            requestPermissionForAlias("bluetooth", call, "bluetoothDevicesPermissionCallback");
            return;
        }
        resolveBondedDevices(call);
    }

    @PermissionCallback
    private void bluetoothDevicesPermissionCallback(PluginCall call) {
        if (!hasBluetoothPermission()) {
            call.reject("กรุณาอนุญาต Bluetooth ให้แอปก่อน");
            return;
        }
        resolveBondedDevices(call);
    }

    @PluginMethod
    public void printBluetoothEscPos(PluginCall call) {
        if (!hasBluetoothPermission()) {
            requestPermissionForAlias("bluetooth", call, "bluetoothPrintPermissionCallback");
            return;
        }
        sendBluetoothPrint(call);
    }

    @PermissionCallback
    private void bluetoothPrintPermissionCallback(PluginCall call) {
        if (!hasBluetoothPermission()) {
            call.reject("กรุณาอนุญาต Bluetooth ให้แอปก่อน");
            return;
        }
        sendBluetoothPrint(call);
    }

    @PluginMethod
    public void printBluetoothTextBitmap(PluginCall call) {
        if (!hasBluetoothPermission()) {
            requestPermissionForAlias("bluetooth", call, "bluetoothTextBitmapPermissionCallback");
            return;
        }
        sendBluetoothTextBitmap(call);
    }

    @PluginMethod
    public void renderTextBitmapPreview(PluginCall call) {
        JSArray lines = call.getArray("lines");
        Integer paperWidthValue = call.getInt("paperWidthDots", 576);
        if (lines == null || lines.length() == 0) {
            call.reject("No text lines to render");
            return;
        }
        int paperWidthDots = paperWidthValue == null ? 576 : Math.max(320, Math.min(paperWidthValue, 576));
        new Thread(() -> {
            Bitmap bitmap = null;
            try {
                bitmap = renderTextBitmap(lines, paperWidthDots);
                ByteArrayOutputStream png = new ByteArrayOutputStream();
                bitmap.compress(Bitmap.CompressFormat.PNG, 100, png);
                JSObject result = new JSObject();
                result.put("width", bitmap.getWidth());
                result.put("height", bitmap.getHeight());
                result.put("pngBase64", Base64.encodeToString(png.toByteArray(), Base64.NO_WRAP));
                getActivity().runOnUiThread(() -> call.resolve(result));
            } catch (Exception error) {
                getActivity().runOnUiThread(() -> call.reject("Bitmap preview failed: " + error.getMessage(), error));
            } finally {
                if (bitmap != null) {
                    bitmap.recycle();
                }
            }
        }).start();
    }

    @PermissionCallback
    private void bluetoothTextBitmapPermissionCallback(PluginCall call) {
        if (!hasBluetoothPermission()) {
            call.reject("Bluetooth permission is required");
            return;
        }
        sendBluetoothTextBitmap(call);
    }

    private boolean hasBluetoothPermission() {
        return Build.VERSION.SDK_INT < Build.VERSION_CODES.S || getPermissionState("bluetooth") == PermissionState.GRANTED;
    }

    private void resolveBondedDevices(PluginCall call) {
        try {
            BluetoothAdapter adapter = BluetoothAdapter.getDefaultAdapter();
            if (adapter == null) {
                call.reject("อุปกรณ์นี้ไม่รองรับ Bluetooth");
                return;
            }
            if (!adapter.isEnabled()) {
                call.reject("กรุณาเปิด Bluetooth ก่อน");
                return;
            }

            JSArray devices = new JSArray();
            Set<BluetoothDevice> bondedDevices = adapter.getBondedDevices();
            for (BluetoothDevice device : bondedDevices) {
                JSObject item = new JSObject();
                item.put("name", device.getName() == null ? "Unknown printer" : device.getName());
                item.put("address", device.getAddress());
                devices.put(item);
            }

            JSObject result = new JSObject();
            result.put("devices", devices);
            call.resolve(result);
        } catch (Exception error) {
            call.reject("อ่านรายการ Bluetooth ไม่สำเร็จ: " + error.getMessage(), error);
        }
    }

    private void sendBluetoothPrint(PluginCall call) {
        String address = call.getString("address", "").trim();
        String escposBase64 = call.getString("escposBase64", "");
        Integer timeoutValue = call.getInt("timeoutMs", 12000);
        Integer chunkSizeValue = call.getInt("chunkSize", 256);
        Integer chunkDelayValue = call.getInt("chunkDelayMs", 20);
        Integer finalDelayValue = call.getInt("finalDelayMs", 1800);

        if (address.isEmpty()) {
            call.reject("กรุณาเลือกเครื่องพิมพ์ Bluetooth ที่จับคู่ไว้");
            return;
        }
        if (escposBase64.isEmpty()) {
            call.reject("ไม่มีข้อมูลใบพิมพ์");
            return;
        }

        int timeoutMs = timeoutValue == null ? 12000 : timeoutValue;
        int chunkSize = chunkSizeValue == null ? 256 : Math.max(64, Math.min(chunkSizeValue, 1024));
        int chunkDelayMs = chunkDelayValue == null ? 20 : Math.max(0, Math.min(chunkDelayValue, 120));
        int finalDelayMs = finalDelayValue == null ? 1800 : Math.max(300, Math.min(finalDelayValue, 5000));

        new Thread(() -> {
            try {
                byte[] payload = Base64.decode(escposBase64, Base64.DEFAULT);
                BluetoothAdapter adapter = BluetoothAdapter.getDefaultAdapter();
                if (adapter == null) {
                    throw new Exception("อุปกรณ์นี้ไม่รองรับ Bluetooth");
                }
                if (!adapter.isEnabled()) {
                    throw new Exception("กรุณาเปิด Bluetooth ก่อน");
                }

                BluetoothDevice device = adapter.getRemoteDevice(address);
                try {
                    adapter.cancelDiscovery();
                } catch (SecurityException ignored) {
                    // Printing to an already paired SPP device can continue without discovery cancellation.
                }

                boolean sentByBle = false;
                String deviceName = device.getName() == null ? "" : device.getName();
                if (shouldPreferBleFirst(deviceName)) {
                    try {
                        sendBluetoothLePrint(device, payload, chunkSize, chunkDelayMs, finalDelayMs);
                        sentByBle = true;
                    } catch (Exception ignored) {
                        // Fall back to classic RFCOMM for dual-mode printers with misleading names.
                    }
                }

                if (!sentByBle) {
                    try {
                        try (BluetoothSocket socket = connectBluetoothSocket(device)) {
                            OutputStream output = socket.getOutputStream();
                            for (int offset = 0; offset < payload.length; offset += chunkSize) {
                                int length = Math.min(chunkSize, payload.length - offset);
                                output.write(payload, offset, length);
                                output.flush();
                                if (chunkDelayMs > 0) {
                                    Thread.sleep(chunkDelayMs);
                                }
                            }
                            output.flush();
                            Thread.sleep(finalDelayMs);
                        }
                    } catch (Exception classicError) {
                        sendBluetoothLePrint(device, payload, chunkSize, chunkDelayMs, finalDelayMs);
                        sentByBle = true;
                    }
                }

                JSObject result = new JSObject();
                result.put("bytesWritten", payload.length);
                result.put("address", address);
                result.put("transport", sentByBle ? "BLE_GATT" : "RFCOMM");
                getActivity().runOnUiThread(() -> call.resolve(result));
            } catch (Exception error) {
                getActivity().runOnUiThread(() -> call.reject("ส่งงานพิมพ์ Bluetooth ไม่สำเร็จ: " + error.getMessage(), error));
            }
        }).start();
    }

    private void sendBluetoothTextBitmap(PluginCall call) {
        String address = call.getString("address", "").trim();
        JSArray lines = call.getArray("lines");
        Integer paperWidthValue = call.getInt("paperWidthDots", 576);
        Integer chunkSizeValue = call.getInt("chunkSize", 256);
        Integer chunkDelayValue = call.getInt("chunkDelayMs", 20);
        Integer finalDelayValue = call.getInt("finalDelayMs", 1800);
        Boolean openCashDrawerValue = call.getBoolean("openCashDrawer", false);
        Integer cashDrawerPinValue = call.getInt("cashDrawerPin", 0);

        if (address.isEmpty()) {
            call.reject("Please select a paired Bluetooth printer");
            return;
        }
        if (lines == null || lines.length() == 0) {
            call.reject("No text lines to print");
            return;
        }

        int paperWidthDots = paperWidthValue == null ? 576 : Math.max(320, Math.min(paperWidthValue, 576));
        int chunkSize = chunkSizeValue == null ? 256 : Math.max(64, Math.min(chunkSizeValue, 1024));
        int chunkDelayMs = chunkDelayValue == null ? 20 : Math.max(0, Math.min(chunkDelayValue, 120));
        int finalDelayMs = finalDelayValue == null ? 1800 : Math.max(300, Math.min(finalDelayValue, 5000));
        boolean openCashDrawer = openCashDrawerValue != null && openCashDrawerValue;
        int cashDrawerPin = cashDrawerPinValue != null && cashDrawerPinValue == 1 ? 1 : 0;

        new Thread(() -> {
            Bitmap bitmap = null;
            try {
                bitmap = renderTextBitmap(lines, paperWidthDots);
                byte[] payload = bitmapToEscPosBitImage(bitmap, openCashDrawer, cashDrawerPin, true);
                JSObject result = writeBluetoothPayload(address, payload, chunkSize, chunkDelayMs, Math.max(finalDelayMs, 2200));
                result.put("cutIncluded", true);
                getActivity().runOnUiThread(() -> call.resolve(result));
            } catch (Exception error) {
                getActivity().runOnUiThread(() -> call.reject("Bluetooth bitmap print failed: " + error.getMessage(), error));
            } finally {
                if (bitmap != null) {
                    bitmap.recycle();
                }
            }
        }).start();
    }

    private JSObject writeBluetoothPayload(String address, byte[] payload, int chunkSize, int chunkDelayMs, int finalDelayMs) throws Exception {
        BluetoothAdapter adapter = BluetoothAdapter.getDefaultAdapter();
        if (adapter == null) {
            throw new Exception("This device does not support Bluetooth");
        }
        if (!adapter.isEnabled()) {
            throw new Exception("Bluetooth is off");
        }

        BluetoothDevice device = adapter.getRemoteDevice(address);
        try {
            adapter.cancelDiscovery();
        } catch (SecurityException ignored) {
            // Printing to an already paired device can continue without discovery cancellation.
        }

        boolean sentByBle = false;
        String deviceName = device.getName() == null ? "" : device.getName();
        if (shouldPreferBleFirst(deviceName)) {
            try {
                sendBluetoothLePrint(device, payload, chunkSize, chunkDelayMs, finalDelayMs);
                sentByBle = true;
            } catch (Exception ignored) {
                // Fall back to classic RFCOMM for dual-mode printers with misleading names.
            }
        }

        if (!sentByBle) {
            try {
                try (BluetoothSocket socket = connectBluetoothSocket(device)) {
                    OutputStream output = socket.getOutputStream();
                    for (int offset = 0; offset < payload.length; offset += chunkSize) {
                        int length = Math.min(chunkSize, payload.length - offset);
                        output.write(payload, offset, length);
                        output.flush();
                        if (chunkDelayMs > 0) {
                            Thread.sleep(chunkDelayMs);
                        }
                    }
                    output.flush();
                    Thread.sleep(finalDelayMs);
                }
            } catch (Exception classicError) {
                sendBluetoothLePrint(device, payload, chunkSize, chunkDelayMs, finalDelayMs);
                sentByBle = true;
            }
        }

        JSObject result = new JSObject();
        result.put("bytesWritten", payload.length);
        result.put("address", address);
        result.put("transport", sentByBle ? "BLE_GATT" : "RFCOMM");
        return result;
    }

    private boolean shouldPreferBleFirst(String deviceName) {
        // POS-8390 advertises as BLE/DUAL, but RFCOMM SPP is much faster for receipt payloads.
        // Keep BLE as the fallback path when classic Bluetooth is not available.
        return false;
    }

    private Bitmap renderTextBitmap(JSArray rawLines, int paperWidthDots) throws Exception {
        List<PrintLine> lines = parsePrintLines(rawLines);
        int padding = paperWidthDots >= 576 ? 28 : 18;
        Paint paint = makeTextPaint();
        int height = measureTextBitmapHeight(lines, paperWidthDots, padding, paint);
        Bitmap bitmap = Bitmap.createBitmap(paperWidthDots, height, Bitmap.Config.ARGB_8888);
        Canvas canvas = new Canvas(bitmap);
        canvas.drawColor(Color.WHITE);

        int y = paperWidthDots >= 576 ? 20 : 14;
        for (PrintLine line : lines) {
            if (line.divider) {
                paint.setStyle(Paint.Style.FILL);
                paint.setColor(Color.BLACK);
                canvas.drawRect(padding, y + 8, paperWidthDots - padding, y + 10, paint);
                y += line.gap > 0 ? line.gap : 22;
                continue;
            }

            configureTextPaint(paint, line);
            Paint.FontMetrics metrics = paint.getFontMetrics();
            int lineHeight = Math.max(22, Math.round(metrics.descent - metrics.ascent + 8));
            List<String> wrapped = wrapBitmapText(paint, line.text, paperWidthDots - (padding * 2));
            if (wrapped.isEmpty()) {
                y += lineHeight;
                continue;
            }

            for (String textLine : wrapped) {
                float textWidth = paint.measureText(textLine);
                float x = padding;
                if ("center".equals(line.align)) {
                    x = Math.max(padding, (paperWidthDots - textWidth) / 2f);
                } else if ("right".equals(line.align)) {
                    x = Math.max(padding, paperWidthDots - padding - textWidth);
                }
                canvas.drawText(textLine, x, y - metrics.ascent, paint);
                y += lineHeight;
            }
            y += line.gap;
        }

        return bitmap;
    }

    private int measureTextBitmapHeight(List<PrintLine> lines, int paperWidthDots, int padding, Paint paint) {
        int height = paperWidthDots >= 576 ? 80 : 58;
        for (PrintLine line : lines) {
            if (line.divider) {
                height += line.gap > 0 ? line.gap : 22;
                continue;
            }
            configureTextPaint(paint, line);
            Paint.FontMetrics metrics = paint.getFontMetrics();
            int lineHeight = Math.max(22, Math.round(metrics.descent - metrics.ascent + 8));
            int count = Math.max(1, wrapBitmapText(paint, line.text, paperWidthDots - (padding * 2)).size());
            height += count * lineHeight + line.gap;
        }
        return Math.max(160, height + BITMAP_TRAILING_MARGIN_DOTS);
    }

    private List<PrintLine> parsePrintLines(JSArray rawLines) throws Exception {
        List<PrintLine> lines = new ArrayList<>();
        for (int index = 0; index < rawLines.length(); index++) {
            JSONObject object = rawLines.getJSONObject(index);
            PrintLine line = new PrintLine();
            line.text = object.optString("text", "");
            line.align = normalizeAlign(object.optString("align", "left"));
            line.bold = object.optBoolean("bold", false);
            line.divider = object.optBoolean("divider", false);
            line.size = Math.max(18, Math.min(104, object.optInt("size", 28)));
            line.gap = Math.max(0, Math.min(40, object.optInt("gap", 2)));
            lines.add(line);
        }
        return lines;
    }

    private String normalizeAlign(String align) {
        if ("center".equals(align) || "right".equals(align)) {
            return align;
        }
        return "left";
    }

    private Paint makeTextPaint() {
        Paint paint = new Paint(Paint.ANTI_ALIAS_FLAG | Paint.SUBPIXEL_TEXT_FLAG);
        paint.setColor(Color.BLACK);
        paint.setStyle(Paint.Style.FILL);
        paint.setTextAlign(Paint.Align.LEFT);
        return paint;
    }

    private void configureTextPaint(Paint paint, PrintLine line) {
        paint.setTextSize(line.size);
        paint.setFakeBoldText(false);
        paint.setTypeface(getThaiTypeface(line.bold));
    }

    private Typeface getThaiTypeface(boolean bold) {
        try {
            if (bold) {
                if (thaiBoldTypeface == null) {
                    thaiBoldTypeface = Typeface.createFromAsset(getContext().getAssets(), "public/fonts/FC-Iconic-Bold.ttf");
                }
                return thaiBoldTypeface;
            }
            if (thaiRegularTypeface == null) {
                thaiRegularTypeface = Typeface.createFromAsset(getContext().getAssets(), "public/fonts/FC-Iconic-Regular.ttf");
            }
            return thaiRegularTypeface;
        } catch (Exception ignored) {
            return Typeface.create("sans-serif", bold ? Typeface.BOLD : Typeface.NORMAL);
        }
    }

    private List<String> wrapBitmapText(Paint paint, String value, float maxWidth) {
        List<String> lines = new ArrayList<>();
        String[] paragraphs = String.valueOf(value == null ? "" : value).split("\\n", -1);
        for (String paragraph : paragraphs) {
            if (paragraph.isEmpty()) {
                lines.add("");
                continue;
            }
            int start = 0;
            while (start < paragraph.length()) {
                String remaining = paragraph.substring(start);
                int count = paint.breakText(remaining, true, maxWidth, null);
                if (count <= 0) {
                    count = 1;
                }
                if (count < remaining.length()) {
                    int space = remaining.lastIndexOf(' ', Math.max(0, count - 1));
                    if (space > 0) {
                        count = space;
                    }
                    while (start + count < paragraph.length() && isThaiCombiningMark(paragraph.charAt(start + count))) {
                        count++;
                    }
                }
                String line = paragraph.substring(start, Math.min(paragraph.length(), start + count)).trim();
                lines.add(line);
                start += count;
                while (start < paragraph.length() && paragraph.charAt(start) == ' ') {
                    start++;
                }
            }
        }
        return lines;
    }

    private boolean isThaiCombiningMark(char value) {
        return (value >= '\u0E31' && value <= '\u0E3A') || (value >= '\u0E47' && value <= '\u0E4E');
    }

    private byte[] bitmapToEscPosBitImage(Bitmap bitmap, boolean openCashDrawer, int cashDrawerPin, boolean includePaperCut) {
        int width = bitmap.getWidth();
        int height = bitmap.getHeight();
        ByteArrayOutputStream output = new ByteArrayOutputStream();
        output.write(0x1b);
        output.write(0x40);
        output.write(0x1b);
        output.write(0x33);
        output.write(0x18);
        if (openCashDrawer) {
            appendCashDrawerKick(output, cashDrawerPin);
        }

        for (int y = 0; y < height; y += 24) {
            output.write(0x1b);
            output.write(0x2a);
            output.write(0x21);
            output.write(width & 0xff);
            output.write((width >> 8) & 0xff);
            for (int x = 0; x < width; x++) {
                for (int slice = 0; slice < 3; slice++) {
                    int packed = 0;
                    for (int bit = 0; bit < 8; bit++) {
                        int pixelY = y + (slice * 8) + bit;
                        if (pixelY < height && isDarkPixel(bitmap.getPixel(x, pixelY))) {
                            packed |= 0x80 >> bit;
                        }
                    }
                    output.write(packed);
                }
            }
            output.write(0x0a);
        }

        output.write(0x1b);
        output.write(0x32);
        appendPaperFeed(output, PRINT_TAIL_FEED_LINES);
        if (includePaperCut) {
            appendPaperCut(output);
        }
        return output.toByteArray();
    }

    private byte[] makePaperCutPayload() {
        ByteArrayOutputStream output = new ByteArrayOutputStream();
        appendPaperFeed(output, PRINT_TAIL_FEED_LINES);
        appendPaperCut(output);
        output.write(0x0a);
        return output.toByteArray();
    }

    private void appendPaperFeed(ByteArrayOutputStream output, int lines) {
        int safeLines = Math.max(0, Math.min(lines, 8));
        for (int index = 0; index < safeLines; index++) {
            output.write(0x0a);
        }
    }

    private void appendPaperCut(ByteArrayOutputStream output) {
        output.write(0x1d);
        output.write(0x56);
        output.write(0x42);
        output.write(0x03);
    }

    private void appendCashDrawerKick(ByteArrayOutputStream output, int cashDrawerPin) {
        int primaryPin = cashDrawerPin == 1 ? 1 : 0;
        appendCashDrawerKickForPin(output, primaryPin);
        appendCashDrawerKickForPin(output, primaryPin == 1 ? 0 : 1);
    }

    private void appendCashDrawerKickForPin(ByteArrayOutputStream output, int cashDrawerPin) {
        int normalizedPin = cashDrawerPin == 1 ? 0x01 : 0x00;
        output.write(0x1b);
        output.write(0x70);
        output.write(normalizedPin);
        output.write(0x64);
        output.write(0xff);
        output.write(0x0a);
        output.write(0x10);
        output.write(0x14);
        output.write(0x01);
        output.write(normalizedPin);
        output.write(0x08);
    }

    private boolean isDarkPixel(int pixel) {
        int alpha = Color.alpha(pixel);
        int red = Color.red(pixel);
        int green = Color.green(pixel);
        int blue = Color.blue(pixel);
        int luminance = Math.round((0.299f * red) + (0.587f * green) + (0.114f * blue));
        return alpha > 10 && luminance < 160;
    }

    private static class PrintLine {
        String text = "";
        String align = "left";
        boolean bold = false;
        boolean divider = false;
        int size = 28;
        int gap = 2;
    }

    private BluetoothSocket connectBluetoothSocket(BluetoothDevice device) throws Exception {
        BluetoothSocket socket = null;
        Exception lastError = null;
        int[] channels = { 1, 1, 2, 3, 4 };
        Method method = device.getClass().getMethod("createRfcommSocket", int.class);
        for (int index = 0; index < channels.length; index++) {
            try {
                if (index > 0) {
                    Thread.sleep(index == 1 ? 1800 : 500);
                }
                socket = (BluetoothSocket) method.invoke(device, channels[index]);
                socket.connect();
                return socket;
            } catch (Exception channelError) {
                closeQuietly(socket);
                lastError = channelError;
            }
        }
        throw lastError == null ? new Exception("Bluetooth RFCOMM connection failed") : lastError;
    }

    private void closeQuietly(BluetoothSocket socket) {
        if (socket == null) {
            return;
        }
        try {
            socket.close();
        } catch (Exception ignored) {
            // Ignore cleanup errors while trying the next Bluetooth connection strategy.
        }
    }

    private void sendBluetoothLePrint(BluetoothDevice device, byte[] payload, int requestedChunkSize, int requestedDelayMs, int finalDelayMs) throws Exception {
        CountDownLatch connectedLatch = new CountDownLatch(1);
        CountDownLatch servicesLatch = new CountDownLatch(1);
        CountDownLatch mtuLatch = new CountDownLatch(1);
        CountDownLatch disconnectedLatch = new CountDownLatch(1);
        AtomicReference<BluetoothGatt> gattRef = new AtomicReference<>();
        AtomicReference<Exception> errorRef = new AtomicReference<>();
        AtomicReference<BluetoothGattCharacteristic> writeCharacteristicRef = new AtomicReference<>();
        AtomicReference<CountDownLatch> writeLatchRef = new AtomicReference<>();
        AtomicInteger writeStatusRef = new AtomicInteger(BluetoothGatt.GATT_SUCCESS);
        AtomicInteger negotiatedMtuRef = new AtomicInteger(BLE_DEFAULT_MTU);

        BluetoothGattCallback callback = new BluetoothGattCallback() {
            @Override
            public void onConnectionStateChange(BluetoothGatt gatt, int status, int newState) {
                if (status != BluetoothGatt.GATT_SUCCESS) {
                    errorRef.compareAndSet(null, new Exception("BLE connection failed: " + status));
                    connectedLatch.countDown();
                    servicesLatch.countDown();
                    disconnectedLatch.countDown();
                    return;
                }
                if (newState == BluetoothProfile.STATE_CONNECTED) {
                    connectedLatch.countDown();
                    gatt.discoverServices();
                } else if (newState == BluetoothProfile.STATE_DISCONNECTED) {
                    disconnectedLatch.countDown();
                }
            }

            @Override
            public void onServicesDiscovered(BluetoothGatt gatt, int status) {
                if (status != BluetoothGatt.GATT_SUCCESS) {
                    errorRef.compareAndSet(null, new Exception("BLE service discovery failed: " + status));
                } else {
                    writeCharacteristicRef.set(findWritableCharacteristic(gatt.getServices()));
                }
                servicesLatch.countDown();
            }

            @Override
            public void onMtuChanged(BluetoothGatt gatt, int mtu, int status) {
                if (status == BluetoothGatt.GATT_SUCCESS && mtu > BLE_DEFAULT_MTU) {
                    negotiatedMtuRef.set(mtu);
                }
                mtuLatch.countDown();
            }

            @Override
            public void onCharacteristicWrite(BluetoothGatt gatt, BluetoothGattCharacteristic characteristic, int status) {
                writeStatusRef.set(status);
                CountDownLatch latch = writeLatchRef.getAndSet(null);
                if (latch != null) {
                    latch.countDown();
                }
            }
        };

        BluetoothGatt gatt = null;
        try {
            gatt = device.connectGatt(getContext(), false, callback, BluetoothDevice.TRANSPORT_LE);
            gattRef.set(gatt);
            if (!connectedLatch.await(BLE_CONNECT_TIMEOUT_MS, TimeUnit.MILLISECONDS)) {
                throw new Exception("BLE connection timeout");
            }
            if (errorRef.get() != null) {
                throw errorRef.get();
            }
            if (!servicesLatch.await(BLE_CONNECT_TIMEOUT_MS, TimeUnit.MILLISECONDS)) {
                throw new Exception("BLE service discovery timeout");
            }
            if (errorRef.get() != null) {
                throw errorRef.get();
            }

            BluetoothGattCharacteristic characteristic = writeCharacteristicRef.get();
            if (characteristic == null) {
                throw new Exception("No writable BLE printer characteristic found");
            }

            try {
                gatt.requestMtu(BLE_TARGET_MTU);
                mtuLatch.await(2500, TimeUnit.MILLISECONDS);
            } catch (Exception ignored) {
                // Default 20-byte BLE writes still work when MTU negotiation is not supported.
            }

            int properties = characteristic.getProperties();
            boolean supportsWrite = (properties & BluetoothGattCharacteristic.PROPERTY_WRITE) != 0;
            boolean supportsWriteNoResponse = (properties & BluetoothGattCharacteristic.PROPERTY_WRITE_NO_RESPONSE) != 0;
            boolean useWriteNoResponse = supportsWriteNoResponse && (!supportsWrite || payload.length <= 2048);
            characteristic.setWriteType(useWriteNoResponse ? BluetoothGattCharacteristic.WRITE_TYPE_NO_RESPONSE : BluetoothGattCharacteristic.WRITE_TYPE_DEFAULT);

            int mtuPayloadBytes = Math.max(20, negotiatedMtuRef.get() - 3);
            int writeChunkSize = Math.max(20, Math.min(Math.min(requestedChunkSize, mtuPayloadBytes), 182));
            int delayMs = Math.max(0, Math.min(requestedDelayMs, useWriteNoResponse ? 12 : 60));

            for (int offset = 0, writeCount = 0; offset < payload.length; offset += writeChunkSize, writeCount++) {
                int length = Math.min(writeChunkSize, payload.length - offset);
                byte[] chunk = new byte[length];
                System.arraycopy(payload, offset, chunk, 0, length);
                characteristic.setValue(chunk);

                CountDownLatch writeLatch = useWriteNoResponse ? null : new CountDownLatch(1);
                writeStatusRef.set(BluetoothGatt.GATT_SUCCESS);
                writeLatchRef.set(writeLatch);
                if (!gatt.writeCharacteristic(characteristic)) {
                    throw new Exception("BLE write was rejected by Android");
                }
                if (writeLatch != null) {
                    if (!writeLatch.await(5000, TimeUnit.MILLISECONDS)) {
                        throw new Exception("BLE write timeout");
                    }
                    if (writeStatusRef.get() != BluetoothGatt.GATT_SUCCESS) {
                        throw new Exception("BLE write failed: " + writeStatusRef.get());
                    }
                } else if (useWriteNoResponse) {
                    if (delayMs > 0) {
                        Thread.sleep(delayMs);
                    }
                    if (writeCount > 0 && writeCount % 24 == 0) {
                        Thread.sleep(25);
                    }
                }
            }
            Thread.sleep(Math.max(300, Math.min(finalDelayMs, 1800)));
        } finally {
            BluetoothGatt activeGatt = gattRef.get();
            if (activeGatt != null) {
                try {
                    activeGatt.disconnect();
                    disconnectedLatch.await(1200, TimeUnit.MILLISECONDS);
                } catch (Exception ignored) {
                    // Best-effort disconnect before closing the GATT client.
                }
                activeGatt.close();
            } else if (gatt != null) {
                gatt.close();
            }
        }
    }

    private BluetoothGattCharacteristic findWritableCharacteristic(List<BluetoothGattService> services) {
        BluetoothGattCharacteristic fallback = null;
        for (BluetoothGattService service : services) {
            for (BluetoothGattCharacteristic characteristic : service.getCharacteristics()) {
                int properties = characteristic.getProperties();
                boolean canWrite = (properties & BluetoothGattCharacteristic.PROPERTY_WRITE) != 0;
                boolean canWriteNoResponse = (properties & BluetoothGattCharacteristic.PROPERTY_WRITE_NO_RESPONSE) != 0;
                if (!canWrite && !canWriteNoResponse) {
                    continue;
                }
                String serviceUuid = service.getUuid().toString().toLowerCase();
                String characteristicUuid = characteristic.getUuid().toString().toLowerCase();
                if (serviceUuid.contains("ff00") || serviceUuid.contains("ffe0") || serviceUuid.contains("fff0")
                        || characteristicUuid.contains("ff01") || characteristicUuid.contains("ffe1") || characteristicUuid.contains("fff1")
                        || characteristicUuid.contains("fff2") || characteristicUuid.contains("fff3")) {
                    return characteristic;
                }
                if (fallback == null) {
                    fallback = characteristic;
                }
            }
        }
        return fallback;
    }
}
