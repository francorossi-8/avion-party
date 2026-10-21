import com.franco.avionparty.core.WebServer;

import java.io.File;
import java.io.IOException;
import java.nio.file.Files;

/** Para probar el servidor en una PC: java DesktopMain carpeta_web [puerto] */
public class DesktopMain {
    public static void main(String[] args) throws Exception {
        final File root = new File(args[0]).getCanonicalFile();
        int port = args.length > 1 ? Integer.parseInt(args[1]) : 8080;
        WebServer ws = new WebServer(new WebServer.FileSource() {
            public byte[] read(String path) throws IOException {
                File f = new File(root, path).getCanonicalFile();
                if (!f.getPath().startsWith(root.getPath()) || !f.isFile()) return null;
                return Files.readAllBytes(f.toPath());
            }
        });
        ws.start(port);
        System.out.println("Servidor en puerto " + ws.port() + " IPs: " + WebServer.localIps());
        Thread.currentThread().join();
    }
}
