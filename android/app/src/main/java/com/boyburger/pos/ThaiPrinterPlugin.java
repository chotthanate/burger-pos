package com.boyburger.pos;

import android.util.Base64;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.OutputStream;
import java.net.InetSocketAddress;
import java.net.Socket;

@CapacitorPlugin(name = "ThaiPrinter")
public class ThaiPrinterPlugin extends Plugin {
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
}
