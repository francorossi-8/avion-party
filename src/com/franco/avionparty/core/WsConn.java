package com.franco.avionparty.core;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.Socket;
import java.nio.charset.Charset;
import java.util.concurrent.LinkedBlockingQueue;
import java.util.concurrent.TimeUnit;

/** Una conexión WebSocket (RFC 6455) con cola de salida propia. */
public final class WsConn {
    private static final Charset UTF8 = Charset.forName("UTF-8");
    private static final int MAX_MSG = 1 << 20;
    private static final int MAX_QUEUE = 400;

    private final Socket socket;
    private final InputStream in;
    private final OutputStream out;
    private final Hub hub;
    private final LinkedBlockingQueue<byte[]> queue = new LinkedBlockingQueue<byte[]>();
    private volatile boolean closed;
    /** Lo asigna el Hub. */
    Object session;

    WsConn(Socket socket, InputStream in, OutputStream out, Hub hub) {
        this.socket = socket;
        this.in = in;
        this.out = out;
        this.hub = hub;
    }

    void run() {
        Thread writer = new Thread(new Runnable() {
            public void run() { writeLoop(); }
        }, "ws-writer");
        writer.setDaemon(true);
        writer.start();
        hub.onOpen(this);
        try {
            readLoop();
        } catch (IOException ignored) {
        } finally {
            close();
            hub.onClose(this);
        }
    }

    public void send(String text) {
        if (closed) return;
        if (queue.size() > MAX_QUEUE) { close(); return; }
        queue.offer(frame(1, text.getBytes(UTF8)));
    }

    public void close() {
        if (closed) return;
        closed = true;
        queue.offer(new byte[0]);
        try { socket.close(); } catch (IOException ignored) { }
    }

    public boolean isClosed() { return closed; }

    private void writeLoop() {
        try {
            while (!closed) {
                byte[] b = queue.poll(30, TimeUnit.SECONDS);
                if (b == null) { b = frame(9, new byte[0]); }
                if (b.length == 0) break;
                out.write(b);
                // juntar lo que ya está en cola antes de hacer flush
                byte[] more;
                while ((more = queue.poll()) != null) {
                    if (more.length == 0) { closed = true; break; }
                    out.write(more);
                }
                out.flush();
            }
        } catch (Exception e) {
            close();
        }
    }

    private void readLoop() throws IOException {
        ByteArrayOutputStream frag = null;
        int fragOp = 0;
        while (!closed) {
            int b0 = in.read();
            int b1 = in.read();
            if (b0 < 0 || b1 < 0) return;
            boolean fin = (b0 & 0x80) != 0;
            int op = b0 & 0x0F;
            boolean masked = (b1 & 0x80) != 0;
            long len = b1 & 0x7F;
            if (len == 126) len = (readN(2));
            else if (len == 127) len = readN(8);
            if (len > MAX_MSG || len < 0) return;
            byte[] mask = new byte[4];
            if (masked) readFully(mask);
            byte[] data = new byte[(int) len];
            readFully(data);
            if (masked) for (int k = 0; k < data.length; k++) data[k] ^= mask[k & 3];

            if (op == 8) { // close
                queue.offer(frame(8, new byte[0]));
                queue.offer(new byte[0]);
                return;
            } else if (op == 9) { // ping
                queue.offer(frame(10, data));
            } else if (op == 10) {
                // pong: nada
            } else if (op == 0) {
                if (frag == null) return;
                frag.write(data);
                if (frag.size() > MAX_MSG) return;
                if (fin) {
                    if (fragOp == 1) deliver(frag.toByteArray());
                    frag = null;
                }
            } else if (op == 1 || op == 2) {
                if (fin) {
                    if (op == 1) deliver(data);
                } else {
                    frag = new ByteArrayOutputStream();
                    frag.write(data);
                    fragOp = op;
                }
            } else {
                return;
            }
        }
    }

    private void deliver(byte[] data) {
        try {
            hub.onMessage(this, new String(data, UTF8));
        } catch (RuntimeException e) {
            // mensaje mal formado: lo ignoramos
        }
    }

    private long readN(int n) throws IOException {
        long v = 0;
        for (int k = 0; k < n; k++) {
            int b = in.read();
            if (b < 0) throw new IOException("eof");
            v = (v << 8) | b;
        }
        return v;
    }

    private void readFully(byte[] buf) throws IOException {
        int off = 0;
        while (off < buf.length) {
            int r = in.read(buf, off, buf.length - off);
            if (r < 0) throw new IOException("eof");
            off += r;
        }
    }

    private static byte[] frame(int op, byte[] payload) {
        int n = payload.length;
        int head = n < 126 ? 2 : (n < 65536 ? 4 : 10);
        byte[] f = new byte[head + n];
        f[0] = (byte) (0x80 | op);
        if (n < 126) {
            f[1] = (byte) n;
        } else if (n < 65536) {
            f[1] = 126;
            f[2] = (byte) (n >> 8);
            f[3] = (byte) n;
        } else {
            f[1] = 127;
            for (int k = 0; k < 8; k++) f[2 + k] = (byte) ((long) n >> (8 * (7 - k)));
        }
        System.arraycopy(payload, 0, f, head, n);
        return f;
    }
}
