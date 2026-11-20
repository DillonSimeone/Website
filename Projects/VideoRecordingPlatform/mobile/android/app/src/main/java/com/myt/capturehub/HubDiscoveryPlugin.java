package com.myt.capturehub;

import android.content.Context;
import android.net.ConnectivityManager;
import android.net.LinkAddress;
import android.net.LinkProperties;
import android.net.Network;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.net.DatagramPacket;
import java.net.DatagramSocket;
import java.net.Inet4Address;
import java.net.InetAddress;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;
import org.json.JSONArray;
import org.json.JSONObject;

@CapacitorPlugin(name = "HubDiscovery")
public class HubDiscoveryPlugin extends Plugin {
    private static final int DISCOVERY_PORT = 3458;
    private static final String PROBE = "MYT-DISCOVER";

    @PluginMethod
    public void discover(PluginCall call) {
        final int timeoutMs = call.getInt("timeoutMs", 3200);
        new Thread(() -> {
            try {
                JSObject result = new JSObject();
                result.put("hubs", listenForHubs(Math.max(1000, timeoutMs)));
                call.resolve(result);
            } catch (Exception err) {
                call.reject("Hub discovery failed", err);
            }
        }).start();
    }

    private JSArray listenForHubs(int timeoutMs) throws Exception {
        Set<String> urls = new LinkedHashSet<>();
        DatagramSocket socket = new DatagramSocket(null);
        try {
            socket.setReuseAddress(true);
            socket.setBroadcast(true);
            socket.bind(new InetSocketAddress(DISCOVERY_PORT));
            socket.setSoTimeout(350);
            sendProbes(socket);

            byte[] buffer = new byte[2048];
            long deadline = System.currentTimeMillis() + timeoutMs;
            long nextProbe = System.currentTimeMillis() + 900;
            while (System.currentTimeMillis() < deadline) {
                if (System.currentTimeMillis() >= nextProbe) {
                    sendProbes(socket);
                    nextProbe = System.currentTimeMillis() + 900;
                }
                DatagramPacket packet = new DatagramPacket(buffer, buffer.length);
                try {
                    socket.receive(packet);
                } catch (java.net.SocketTimeoutException ignored) {
                    continue;
                }
                String text = new String(packet.getData(), packet.getOffset(), packet.getLength(), StandardCharsets.UTF_8).trim();
                collectUrls(text, urls);
            }
        } finally {
            socket.close();
        }

        JSArray hubs = new JSArray();
        if (!urls.isEmpty()) {
            JSObject hub = new JSObject();
            JSArray list = new JSArray();
            for (String url : urls) list.put(url);
            hub.put("urls", list);
            hub.put("url", urls.iterator().next());
            hubs.put(hub);
        }
        return hubs;
    }

    private void sendProbes(DatagramSocket socket) {
        byte[] payload = PROBE.getBytes(StandardCharsets.UTF_8);
        for (InetAddress target : probeTargets()) {
            try {
                socket.send(new DatagramPacket(payload, payload.length, target, DISCOVERY_PORT));
            } catch (Exception ignored) {}
        }
    }

    private List<InetAddress> probeTargets() {
        List<InetAddress> targets = new ArrayList<>();
        try {
            targets.add(InetAddress.getByName("255.255.255.255"));
        } catch (Exception ignored) {}

        Context context = getContext();
        if (context == null) return targets;
        ConnectivityManager cm = (ConnectivityManager) context.getSystemService(Context.CONNECTIVITY_SERVICE);
        if (cm == null || cm.getActiveNetwork() == null) return targets;
        Network network = cm.getActiveNetwork();
        LinkProperties props = cm.getLinkProperties(network);
        if (props == null) return targets;

        for (LinkAddress link : props.getLinkAddresses()) {
            if (!(link.getAddress() instanceof Inet4Address)) continue;
            byte[] ip = link.getAddress().getAddress();
            int prefix = link.getPrefixLength();
            if (prefix < 0 || prefix > 32) continue;
            byte[] broadcast = ip.clone();
            for (int bit = prefix; bit < 32; bit++) {
                broadcast[bit / 8] |= (byte) (1 << (7 - (bit % 8)));
            }
            try {
                targets.add(InetAddress.getByAddress(broadcast));
            } catch (Exception ignored) {}
        }
        return targets;
    }

    private void collectUrls(String text, Set<String> urls) {
        if (!text.startsWith("{")) return;
        try {
            JSONObject json = new JSONObject(text);
            if (!"myt-capture-hub".equals(json.optString("service"))) return;
            JSONArray list = json.optJSONArray("urls");
            if (list != null) {
                for (int i = 0; i < list.length(); i++) {
                    String url = list.optString(i, "").trim();
                    if (url.startsWith("http://") || url.startsWith("https://")) urls.add(url);
                }
            }
            String single = json.optString("url", "").trim();
            if (single.startsWith("http://") || single.startsWith("https://")) urls.add(single);
        } catch (Exception ignored) {}
    }
}
