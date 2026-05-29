package com.boyburger.pos;

import android.Manifest;
import android.bluetooth.BluetoothAdapter;
import android.bluetooth.BluetoothDevice;
import android.bluetooth.BluetoothSocket;
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

import java.io.OutputStream;
import java.net.InetSocketAddress;
import java.net.Socket;
import java.util.Set;
import java.util.UUID;

@CapacitorPlugin(
        name = "ThaiPrinter",
        permissions = {
                @Permission(alias = "bluetooth", strings = { Manifest.permission.BLUETOOTH_CONNECT, Manifest.permission.BLUETOOTH_SCAN })
        }
)
public class ThaiPrinterPlugin extends Plugin {
    private static final UUID SERIAL_PORT_PROFILE_UUID = UUID.fromString("00001101-0000-1000-8000-00805F9B34FB");

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

                try (BluetoothSocket socket = device.createRfcommSocketToServiceRecord(SERIAL_PORT_PROFILE_UUID)) {
                    socket.connect();
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

                JSObject result = new JSObject();
                result.put("bytesWritten", payload.length);
                result.put("address", address);
                getActivity().runOnUiThread(() -> call.resolve(result));
            } catch (Exception error) {
                getActivity().runOnUiThread(() -> call.reject("ส่งงานพิมพ์ Bluetooth ไม่สำเร็จ: " + error.getMessage(), error));
            }
        }).start();
    }
}
