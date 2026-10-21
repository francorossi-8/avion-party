package com.franco.avionparty.core;

import java.io.BufferedOutputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.Inet4Address;
import java.net.InetAddress;
import java.net.InetSocketAddress;
import java.net.NetworkInterface;
import java.net.ServerSocket;
import java.net.Socket;
import java.nio.charset.Charset;
import java.security.MessageDigest;
import java.util.ArrayList;
import java.util.Collections;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;

/** Servidor HTTP mínimo: archivos estáticos + /api/info + WebSocket en /ws. */
public final class WebServer {
    public interface FileSource {
        /** Devuelve el contenido o null si no existe. */
        byte[] read(String path) throws IOException;
    }

    private static final Charset UTF8 = Charset.forName("UTF-8");
    private static final Charset LATIN1 = Charset.forName("ISO-8859-1");

    private final FileSource files;
    private final Hub hub = new Hub();
    /** En el servidor de internet cada grupo (código) tiene su propio lobby, chat y salas. */
    private final Map<String, Hub> groups = new HashMap<String, Hub>();
    private static final int MAX_GROUPS = 300;
    private static final boolean CLOUD = System.getenv("AVION_CLOUD") != null;
    private ServerSocket server;
    private volatile boolean running;
    private int port;

    public WebServer(FileSource files) { this.files = files; }

    public Hub hub() { return hub; }
    public int port() { return port; }

    /** Intenta el puerto pedido y los siguientes 10. */
    public synchronized void start(int preferredPort) throws IOException {
        IOException last = null;
        for (int p = preferredPort; p < preferredPort + 10; p++) {
            try {
                ServerSocket s = new ServerSocket();
                s.setReuseAddress(true);
                s.bind(new InetSocketAddress(p));
                server = s;
                port = p;
                break;
            } catch (IOException e) { last = e; }
        }
        if (server == null) throw last;
        running = true;
        hub.startTicker();
        Thread t = new Thread(new Runnable() {
            public void run() { acceptLoop(); }
        }, "http-accept");
        t.setDaemon(true);
        t.start();
        Thread sw = new Thread(new Runnable() {
            public void run() {
                while (running) {
                    try { Thread.sleep(60000); } catch (InterruptedException e) { return; }
                    sweepGroups();
                }
            }
        }, "groups-sweep");
        sw.setDaemon(true);
        sw.start();
    }

    /** Hub del grupo pedido ("" = el de siempre). null si hay demasiados grupos. */
    Hub hubFor(String g) {
        if (g == null || g.isEmpty()) return hub;
        synchronized (groups) {
            Hub h = groups.get(g);
            if (h == null) {
                if (groups.size() >= MAX_GROUPS) return null;
                h = new Hub();
                h.startTicker();
                groups.put(g, h);
            }
            return h;
        }
    }

    /** Borra los grupos que quedaron vacíos (el hub olvida a los jugadores 30 min después de irse). */
    private void sweepGroups() {
        synchronized (groups) {
            java.util.Iterator<Map.Entry<String, Hub>> it = groups.entrySet().iterator();
            while (it.hasNext()) {
                Map.Entry<String, Hub> e = it.next();
                if (e.getValue().isEmpty()) { e.getValue().stop(); it.remove(); }
            }
        }
    }

    static String cleanGroup(String query) {
        if (query == null) return "";
        for (String kv : query.split("&")) {
            if (kv.startsWith("g=")) {
                String g = kv.substring(2).toUpperCase(Locale.ROOT).replaceAll("[^A-Z0-9]", "");
                return g.length() > 12 ? g.substring(0, 12) : g;
            }
        }
        return "";
    }

    public synchronized void stop() {
        running = false;
        hub.stop();
        synchronized (groups) {
            for (Hub h : groups.values()) h.stop();
            groups.clear();
        }
        try { if (server != null) server.close(); } catch (IOException ignored) { }
        server = null;
    }

    public boolean isRunning() { return running; }

    private void acceptLoop() {
        while (running) {
            try {
                final Socket s = server.accept();
                Thread t = new Thread(new Runnable() {
                    public void run() { handle(s); }
                }, "http-conn");
                t.setDaemon(true);
                t.start();
            } catch (IOException e) {
                if (!running) return;
            }
        }
    }

    private void handle(Socket s) {
        try {
            s.setTcpNoDelay(true);
            s.setSoTimeout(20000);
            InputStream in = s.getInputStream();
            OutputStream out = new BufferedOutputStream(s.getOutputStream(), 16384);
            // keep-alive simple: varias peticiones por conexión
            for (int n = 0; n < 50; n++) {
                Map<String, String> h = new HashMap<String, String>();
                String reqLine = readHead(in, h);
                if (reqLine == null) break;
                String[] parts = reqLine.split(" ");
                if (parts.length < 2) break;
                String method = parts[0];
                String path = parts[1];
                int q = path.indexOf('?');
                String query = q >= 0 ? path.substring(q + 1) : "";
                if (q >= 0) path = path.substring(0, q);

                if (path.equals("/ws") && "websocket".equalsIgnoreCase(h.get("upgrade"))) {
                    String key = h.get("sec-websocket-key");
                    if (key == null) break;
                    Hub target = hubFor(cleanGroup(query));
                    if (target == null) { respond(out, 404, "text/plain; charset=utf-8", "Demasiados grupos".getBytes(UTF8), method, false); break; }
                    String accept = wsAccept(key);
                    out.write(("HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n"
                            + "Sec-WebSocket-Accept: " + accept + "\r\n\r\n").getBytes(LATIN1));
                    out.flush();
                    s.setSoTimeout(70000);
                    new WsConn(s, in, out, target).run();
                    return;
                }

                boolean keep = !"close".equalsIgnoreCase(h.get("connection"));
                if (path.equals("/api/info")) {
                    boolean apk = false;
                    try { apk = !CLOUD && files.read("AvionParty.apk") != null; } catch (IOException ignored) { }
                    Map<String, Object> info = Json.o("port", (double) port, "ips", CLOUD ? new ArrayList<Object>() : localIps(),
                            "app", "Avión Party", "cloud", CLOUD, "apk", apk);
                    respond(out, 200, "application/json; charset=utf-8", Json.stringify(info).getBytes(UTF8), method, keep);
                } else if (path.equals("/generate_204") || path.equals("/hotspot-detect.html")) {
                    // pedidos de "detección de internet": respondemos algo corto
                    respond(out, 204, "text/plain", new byte[0], method, keep);
                } else {
                    if (path.equals("/") || path.isEmpty()) path = "/index.html";
                    byte[] body = null;
                    if (!path.contains("..")) body = files.read(path.substring(1));
                    if (body == null) {
                        respond(out, 404, "text/plain; charset=utf-8", "No encontrado".getBytes(UTF8), method, keep);
                    } else {
                        respond(out, 200, mime(path), body, method, keep);
                    }
                }
                if (!keep) break;
            }
        } catch (IOException ignored) {
        } finally {
            try { s.close(); } catch (IOException ignored) { }
        }
    }

    private static void respond(OutputStream out, int code, String type, byte[] body, String method, boolean keep) throws IOException {
        String status = code == 200 ? "OK" : code == 204 ? "No Content" : "Not Found";
        String head = "HTTP/1.1 " + code + " " + status + "\r\n"
                + "Content-Type: " + type + "\r\n"
                + "Content-Length: " + body.length + "\r\n"
                + "Cache-Control: no-cache\r\n"
                + "Connection: " + (keep ? "keep-alive" : "close") + "\r\n\r\n";
        out.write(head.getBytes(LATIN1));
        if (!"HEAD".equals(method)) out.write(body);
        out.flush();
    }

    /** Lee la línea de petición y los encabezados (en minúscula). */
    private static String readHead(InputStream in, Map<String, String> headers) throws IOException {
        ByteArrayOutputStream line = new ByteArrayOutputStream();
        String first = null;
        int total = 0;
        while (true) {
            int c = in.read();
            if (c < 0) return null;
            if (++total > 16384) return null;
            if (c == '\n') {
                String l = new String(line.toByteArray(), LATIN1).trim();
                line.reset();
                if (first == null) {
                    if (l.isEmpty()) continue;
                    first = l;
                } else if (l.isEmpty()) {
                    return first;
                } else {
                    int p = l.indexOf(':');
                    if (p > 0) headers.put(l.substring(0, p).trim().toLowerCase(Locale.ROOT), l.substring(p + 1).trim());
                }
            } else {
                line.write(c);
            }
        }
    }

    private static String wsAccept(String key) {
        try {
            MessageDigest md = MessageDigest.getInstance("SHA-1");
            byte[] d = md.digest((key + "258EAFA5-E914-47DA-95CA-C5AB0DC85B11").getBytes(LATIN1));
            return java.util.Base64.getEncoder().encodeToString(d);
        } catch (Exception e) {
            throw new RuntimeException(e);
        }
    }

    private static String mime(String p) {
        String l = p.toLowerCase(Locale.ROOT);
        if (l.endsWith(".html")) return "text/html; charset=utf-8";
        if (l.endsWith(".js")) return "application/javascript; charset=utf-8";
        if (l.endsWith(".css")) return "text/css; charset=utf-8";
        if (l.endsWith(".json") || l.endsWith(".webmanifest")) return "application/json; charset=utf-8";
        if (l.endsWith(".png")) return "image/png";
        if (l.endsWith(".svg")) return "image/svg+xml";
        if (l.endsWith(".ico")) return "image/x-icon";
        if (l.endsWith(".apk")) return "application/vnd.android.package-archive";
        return "application/octet-stream";
    }

    /** IPs IPv4 locales, las de red privada primero (192.168 > 10 > 172). */
    public static List<Object> localIps() {
        List<Object> list = new ArrayList<Object>();
        try {
            for (NetworkInterface ni : Collections.list(NetworkInterface.getNetworkInterfaces())) {
                if (!ni.isUp() || ni.isLoopback()) continue;
                for (InetAddress a : Collections.list(ni.getInetAddresses())) {
                    if (a instanceof Inet4Address && !a.isLoopbackAddress()) {
                        list.add(Json.o("ip", a.getHostAddress(), "iface", ni.getName()));
                    }
                }
            }
        } catch (Exception ignored) { }
        Collections.sort(list, new java.util.Comparator<Object>() {
            public int compare(Object a, Object b) { return rank(a) - rank(b); }
        });
        return list;
    }

    private static int rank(Object o) {
        Map<String, Object> m = Json.obj(o);
        String ip = Json.str(m, "ip");
        String iface = Json.str(m, "iface");
        int r = 50;
        if (ip.startsWith("192.168.")) r = 10;
        else if (ip.startsWith("10.")) r = 20;
        else if (ip.startsWith("172.")) r = 30;
        // en Android el hotspot suele ser swlan0 / ap0 / wlan1
        if (iface != null && (iface.startsWith("swlan") || iface.startsWith("ap") || iface.startsWith("softap"))) r -= 5;
        if (iface != null && (iface.startsWith("rmnet") || iface.startsWith("ccmni") || iface.startsWith("docker"))) r += 40;
        return r;
    }
}
