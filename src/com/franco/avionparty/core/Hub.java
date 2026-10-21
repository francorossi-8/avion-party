package com.franco.avionparty.core;

import java.security.SecureRandom;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.Iterator;
import java.util.LinkedHashMap;
import java.util.LinkedList;
import java.util.List;
import java.util.Map;

/**
 * Estado compartido: jugadores, chat y salas. La lógica de cada juego vive en el
 * navegador del anfitrión de la sala; acá solo se reenvían mensajes.
 */
public final class Hub {
    static final long HOST_GRACE_MS = 20000;   // anfitrión desconectado: pasar la posta
    static final long ROOM_GRACE_MS = 180000;  // desconectado: sacarlo de la sala
    static final long FORGET_MS = 1800000;     // olvidar al jugador

    static final class Client {
        String id, name;
        WsConn conn;
        long lastSeen, lastCall;
        String roomId;
        boolean online() { return conn != null; }
    }

    static final class Room {
        String id, game, title, host;
        final List<String> members = new ArrayList<String>();
        long created;
    }

    /** Conexión de la app Android que solo escucha avisos (mensajes privados, chat, invitaciones) de un jugador. */
    static final class Listener {
        String id;
    }

    private final Map<String, Client> clients = new LinkedHashMap<String, Client>();
    private final Map<String, List<WsConn>> listeners = new HashMap<String, List<WsConn>>();
    private final LinkedList<Map<String, Object>> dms = new LinkedList<Map<String, Object>>();
    private long dmSeq = 0;
    private final Map<String, Room> rooms = new LinkedHashMap<String, Room>();
    private final LinkedList<Map<String, Object>> chat = new LinkedList<Map<String, Object>>();
    private final SecureRandom rnd = new SecureRandom();
    private long chatSeq = 0;
    private volatile Thread ticker;

    void startTicker() {
        Thread t = new Thread(new Runnable() {
            public void run() {
                while (ticker == Thread.currentThread()) {
                    try { Thread.sleep(3000); } catch (InterruptedException e) { return; }
                    tick();
                }
            }
        }, "hub-tick");
        t.setDaemon(true);
        ticker = t;
        t.start();
    }

    void stop() {
        Thread t = ticker;
        ticker = null;
        if (t != null) t.interrupt();
        synchronized (this) {
            for (Client c : clients.values()) if (c.conn != null) c.conn.close();
            for (List<WsConn> l : listeners.values()) for (WsConn w : l) w.close();
            listeners.clear();
        }
    }

    /** Sin nadie conectado ni recordado y sin salas. */
    public synchronized boolean isEmpty() {
        for (Client c : clients.values()) if (c.online()) return false;
        return clients.isEmpty() && rooms.isEmpty() && listeners.isEmpty();
    }

    public synchronized int onlineCount() {
        int n = 0;
        for (Client c : clients.values()) if (c.online()) n++;
        return n;
    }

    synchronized void onOpen(WsConn c) { /* esperamos el "hello" */ }

    synchronized void onClose(WsConn conn) {
        if (conn.session instanceof Listener) {
            List<WsConn> l = listeners.get(((Listener) conn.session).id);
            if (l != null) { l.remove(conn); if (l.isEmpty()) listeners.remove(((Listener) conn.session).id); }
            return;
        }
        Client c = (Client) conn.session;
        if (c == null || c.conn != conn) return;
        c.conn = null;
        c.lastSeen = System.currentTimeMillis();
        broadcastLobby();
    }

    synchronized void onMessage(WsConn conn, String text) {
        Map<String, Object> m = Json.obj(Json.parse(text));
        if (m == null) return;
        String t = Json.str(m, "t");
        if (t == null) return;
        Client c = conn.session instanceof Client ? (Client) conn.session : null;

        if (t.equals("hello")) {
            hello(conn, m);
            return;
        }
        if (t.equals("listen")) {
            listen(conn, m);
            return;
        }
        if (conn.session instanceof Listener) {
            if (t.equals("ping")) conn.send("{\"t\":\"pong\"}");
            return;
        }
        if (c == null || c.conn != conn) return;
        c.lastSeen = System.currentTimeMillis();

        if (t.equals("ping")) {
            conn.send("{\"t\":\"pong\"}");
        } else if (t.equals("name")) {
            c.name = cleanName(Json.str(m, "name"), c.name);
            broadcastLobby();
        } else if (t.equals("chat")) {
            String txt = Json.str(m, "text");
            if (txt == null) return;
            txt = txt.trim();
            if (txt.isEmpty()) return;
            if (txt.length() > 400) txt = txt.substring(0, 400);
            Map<String, Object> msg = Json.o("t", "chat", "n", (double) (++chatSeq), "from", c.id,
                    "name", c.name, "text", txt, "ts", (double) System.currentTimeMillis());
            chat.add(msg);
            while (chat.size() > 120) chat.removeFirst();
            String s = Json.stringify(msg);
            for (Client o : clients.values()) if (o.online()) o.conn.send(s);
            notifyAll(c.id, Json.o("t", "notif", "kind", "chat", "from", c.id, "title", c.name + " · Chat", "body", txt));
        } else if (t.equals("dm")) {
            // mensaje privado: lo ven solo los dos (y queda para cuando el otro se reconecte)
            String to = Json.str(m, "to");
            String txt = Json.str(m, "text");
            if (to == null || txt == null || to.equals(c.id) || !clients.containsKey(to)) return;
            txt = txt.trim();
            if (txt.isEmpty()) return;
            if (txt.length() > 400) txt = txt.substring(0, 400);
            Map<String, Object> msg = Json.o("t", "dm", "n", (double) (++dmSeq), "from", c.id, "to", to,
                    "name", c.name, "text", txt, "ts", (double) System.currentTimeMillis());
            dms.add(msg);
            while (dms.size() > 600) dms.removeFirst();
            String s = Json.stringify(msg);
            c.conn.send(s);
            Client o = clients.get(to);
            if (o != null && o.online()) o.conn.send(s);
            notifyUser(to, Json.o("t", "notif", "kind", "dm", "from", c.id, "title", "🔒 " + c.name, "body", txt));
        } else if (t.equals("call")) {
            // "¡vengan a jugar!": aviso a todos (o a algunos), con la sala para unirse de un toque
            long now = System.currentTimeMillis();
            if (now - c.lastCall < 8000) return;
            c.lastCall = now;
            String txt = Json.str(m, "text");
            txt = txt == null || txt.trim().isEmpty() ? "¡Vengan a jugar!" : clip(txt.trim(), 80);
            String room = c.roomId;
            Room r = room == null ? null : rooms.get(room);
            Map<String, Object> msg = Json.o("t", "call", "from", c.id, "name", c.name, "text", txt,
                    "room", r == null ? null : r.id, "game", r == null ? null : r.game);
            String s = Json.stringify(msg);
            for (Client o : clients.values()) {
                if (o == c) continue;
                if (r != null && r.id.equals(o.roomId)) continue;   // ya están en la sala
                if (o.online()) o.conn.send(s);
                notifyUser(o.id, Json.o("t", "notif", "kind", "call", "from", c.id, "room", r == null ? null : r.id,
                        "title", "📣 " + c.name, "body", txt));
            }
        } else if (t.equals("create")) {
            String game = Json.str(m, "game");
            if (game == null || game.length() > 30) return;
            leaveRoom(c);
            Room r = new Room();
            r.id = newRoomId();
            r.game = game;
            String title = Json.str(m, "title");
            r.title = (title == null || title.trim().isEmpty()) ? ("Sala de " + c.name) : clip(title.trim(), 30);
            r.host = c.id;
            r.created = System.currentTimeMillis();
            r.members.add(c.id);
            rooms.put(r.id, r);
            c.roomId = r.id;
            conn.send(Json.stringify(Json.o("t", "joined", "room", r.id)));
            broadcastLobby();
        } else if (t.equals("join")) {
            Room r = rooms.get(Json.str(m, "room"));
            if (r == null) {
                conn.send(Json.stringify(Json.o("t", "error", "msg", "Esa sala ya no existe")));
                return;
            }
            if (!r.id.equals(c.roomId)) {
                leaveRoom(c);
                r.members.add(c.id);
                c.roomId = r.id;
            }
            conn.send(Json.stringify(Json.o("t", "joined", "room", r.id)));
            broadcastLobby();
        } else if (t.equals("leave")) {
            leaveRoom(c);
            conn.send(Json.stringify(Json.o("t", "left")));
            broadcastLobby();
        } else if (t.equals("g")) {
            Room r = c.roomId == null ? null : rooms.get(c.roomId);
            if (r == null) return;
            Map<String, Object> out = Json.o("t", "g", "from", c.id, "d", m.get("d"));
            String s = Json.stringify(out);
            String to = Json.str(m, "to");
            if (to != null) {
                Client o = clients.get(to);
                if (o != null && o.online() && r.id.equals(o.roomId)) o.conn.send(s);
            } else {
                for (String id : r.members) {
                    if (id.equals(c.id)) continue;
                    Client o = clients.get(id);
                    if (o != null && o.online()) o.conn.send(s);
                }
            }
        }
    }

    private void hello(WsConn conn, Map<String, Object> m) {
        String id = Json.str(m, "id");
        Client c = id == null ? null : clients.get(id);
        if (c == null) {
            c = new Client();
            c.id = (id != null && id.matches("[A-Za-z0-9]{6,24}")) ? id : randomId(10);
            c.name = "Jugador";
            clients.put(c.id, c);
        }
        if (c.conn != null && c.conn != conn) {
            WsConn old = c.conn;
            old.session = null;
            old.close();
        }
        c.conn = conn;
        conn.session = c;
        c.lastSeen = System.currentTimeMillis();
        c.name = cleanName(Json.str(m, "name"), c.name);
        // si su sala desapareció mientras no estaba
        if (c.roomId != null && !rooms.containsKey(c.roomId)) c.roomId = null;
        List<Object> mine = new ArrayList<Object>();
        for (Map<String, Object> d : dms) {
            if (c.id.equals(d.get("from")) || c.id.equals(d.get("to"))) mine.add(d);
        }
        while (mine.size() > 300) mine.remove(0);
        conn.send(Json.stringify(Json.o("t", "welcome", "id", c.id, "room", c.roomId, "chat", new ArrayList<Object>(chat), "dms", mine)));
        broadcastLobby();
    }

    /** La app Android se queda escuchando los avisos de este jugador (aunque la pantalla esté bloqueada). */
    private void listen(WsConn conn, Map<String, Object> m) {
        String id = Json.str(m, "id");
        if (id == null || !id.matches("[A-Za-z0-9]{6,24}")) { conn.close(); return; }
        Listener l = new Listener();
        l.id = id;
        conn.session = l;
        List<WsConn> list = listeners.get(id);
        if (list == null) { list = new ArrayList<WsConn>(); listeners.put(id, list); }
        while (list.size() >= 3) { WsConn old = list.remove(0); old.close(); }
        list.add(conn);
        conn.send("{\"t\":\"listening\"}");
    }

    private void notifyUser(String id, Map<String, Object> msg) {
        List<WsConn> l = listeners.get(id);
        if (l == null || l.isEmpty()) return;
        String s = Json.stringify(msg);
        for (WsConn w : l) w.send(s);
    }

    private void notifyAll(String exceptId, Map<String, Object> msg) {
        String s = null;
        for (Map.Entry<String, List<WsConn>> e : listeners.entrySet()) {
            if (e.getKey().equals(exceptId)) continue;
            if (s == null) s = Json.stringify(msg);
            for (WsConn w : e.getValue()) w.send(s);
        }
    }

    private void leaveRoom(Client c) {
        if (c.roomId == null) return;
        Room r = rooms.get(c.roomId);
        c.roomId = null;
        if (r == null) return;
        r.members.remove(c.id);
        if (r.members.isEmpty()) {
            rooms.remove(r.id);
            return;
        }
        if (c.id.equals(r.host)) r.host = pickHost(r);
    }

    private String pickHost(Room r) {
        for (String id : r.members) {
            Client o = clients.get(id);
            if (o != null && o.online()) return id;
        }
        return r.members.get(0);
    }

    synchronized void tick() {
        long now = System.currentTimeMillis();
        boolean changed = false;
        for (Room r : rooms.values()) {
            Client h = clients.get(r.host);
            if (h != null && !h.online() && now - h.lastSeen > HOST_GRACE_MS) {
                String nh = pickHost(r);
                if (!nh.equals(r.host) && clients.get(nh) != null && clients.get(nh).online()) {
                    r.host = nh;
                    changed = true;
                }
            }
        }
        Iterator<Client> it = clients.values().iterator();
        List<Client> toRemove = new ArrayList<Client>();
        while (it.hasNext()) {
            Client c = it.next();
            if (c.online()) continue;
            if (c.roomId != null && now - c.lastSeen > ROOM_GRACE_MS) { toRemove.add(c); }
            else if (now - c.lastSeen > FORGET_MS) { it.remove(); changed = true; }
        }
        for (Client c : toRemove) { leaveRoom(c); changed = true; }
        if (changed) broadcastLobby();
    }

    private void broadcastLobby() {
        List<Object> users = new ArrayList<Object>();
        for (Client c : clients.values()) {
            users.add(Json.o("id", c.id, "name", c.name, "online", c.online(), "room", c.roomId));
        }
        List<Object> rs = new ArrayList<Object>();
        for (Room r : rooms.values()) {
            rs.add(Json.o("id", r.id, "game", r.game, "title", r.title, "host", r.host,
                    "members", new ArrayList<Object>(r.members)));
        }
        String s = Json.stringify(Json.o("t", "lobby", "users", users, "rooms", rs));
        for (Client c : clients.values()) if (c.online()) c.conn.send(s);
    }

    private String newRoomId() {
        String id;
        do {
            id = randomFrom("ABCDEFGHJKLMNPQRSTUVWXYZ23456789", 4);
        } while (rooms.containsKey(id));
        return id;
    }

    private String randomId(int n) {
        return randomFrom("abcdefghijkmnopqrstuvwxyz23456789", n);
    }

    private String randomFrom(String alphabet, int n) {
        StringBuilder b = new StringBuilder();
        for (int k = 0; k < n; k++) b.append(alphabet.charAt(rnd.nextInt(alphabet.length())));
        return b.toString();
    }

    private static String cleanName(String n, String fallback) {
        if (n == null) return fallback;
        n = n.replaceAll("[\\p{Cntrl}]", "").trim();
        if (n.isEmpty()) return fallback;
        return clip(n, 18);
    }

    private static String clip(String s, int max) {
        return s.length() <= max ? s : s.substring(0, max);
    }
}
