package com.appbarpos.infrastructure.storage;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

@Component
public class AppDataPaths {
    private final Path root;

    public AppDataPaths(@Value("${appbarpos.data-dir}") String configuredRoot) throws IOException {
        root = configuredRoot.isBlank() ? resolveRoot() : Path.of(configuredRoot).toAbsolutePath().normalize();
        for (String directory : new String[]{"data", "media/productos", "backups", "logs"}) {
            Files.createDirectories(root.resolve(directory));
        }
    }

    public static Path resolveRoot() {
        String override = System.getenv("APPBARPOS_DATA_DIR");
        if (override != null && !override.isBlank()) {
            return Path.of(override).toAbsolutePath().normalize();
        }
        String localAppData = System.getenv("LOCALAPPDATA");
        if (localAppData != null && !localAppData.isBlank()) {
            return Path.of(localAppData, "BarSoftware").toAbsolutePath().normalize();
        }
        // Alternativa únicamente para desarrollar fuera de Windows.
        return Path.of(System.getProperty("user.home"), ".local", "share", "BarSoftware");
    }

    public Path database() {
        return root.resolve("data/bar.db");
    }

    public Path root() { return root; }
}
