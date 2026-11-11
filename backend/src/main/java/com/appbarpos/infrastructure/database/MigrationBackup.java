package com.appbarpos.infrastructure.database;

import com.appbarpos.infrastructure.storage.AppDataPaths;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.LinkOption;
import java.nio.file.StandardCopyOption;
import java.security.DigestInputStream;
import java.security.MessageDigest;
import java.time.Instant;
import java.util.HexFormat;
import java.util.Properties;
import java.util.UUID;
import java.util.zip.ZipEntry;
import java.util.zip.ZipOutputStream;
import javax.sql.DataSource;

public final class MigrationBackup {
    private MigrationBackup() { }

    public static Path create(DataSource source, AppDataPaths paths) throws Exception {
        Path backupRoot = paths.root().resolve("backups");
        Path staging = Files.createTempDirectory(backupRoot, ".migration-");
        Path snapshot = staging.resolve("bar.db");
        Path partial = backupRoot.resolve("pre-migration-" + Instant.now().toEpochMilli() + "-" + UUID.randomUUID() + ".zip.part");
        Path completed = partial.resolveSibling(partial.getFileName().toString().replace(".part", ""));
        try {
            try (var connection = source.getConnection(); var statement = connection.createStatement()) {
                statement.execute("VACUUM INTO '" + snapshot.toString().replace("'", "''") + "'");
            }
            try (var connection = java.sql.DriverManager.getConnection("jdbc:sqlite:" + snapshot);
                 var statement = connection.createStatement(); var result = statement.executeQuery("PRAGMA quick_check")) {
                if (!result.next() || !"ok".equals(result.getString(1))) throw new IOException("Respaldo SQLite inválido");
            }
            Properties manifest = new Properties();
            manifest.setProperty("format", "appbarpos-backup-v1");
            manifest.setProperty("createdAt", Instant.now().toString());
            try (var zip = new ZipOutputStream(Files.newOutputStream(partial))) {
                add(zip, snapshot, "data/bar.db", manifest);
                Path media = paths.root().resolve("media");
                try (var files = Files.walk(media)) {
                    for (Path file : files.toList()) {
                        if (Files.isSymbolicLink(file)) throw new IOException("El respaldo no admite enlaces simbólicos");
                        if (Files.isRegularFile(file, LinkOption.NOFOLLOW_LINKS)) {
                            add(zip, file, paths.root().relativize(file).toString().replace('\\', '/'), manifest);
                        }
                    }
                }
                var bytes = new ByteArrayOutputStream();
                manifest.store(bytes, "AppBarPOS: SHA-256 de cada archivo incluido");
                zip.putNextEntry(new ZipEntry("manifest.properties"));
                zip.write(bytes.toByteArray());
                zip.closeEntry();
            }
            try {
                Files.move(partial, completed, StandardCopyOption.ATOMIC_MOVE);
            } catch (java.nio.file.AtomicMoveNotSupportedException exception) {
                Files.move(partial, completed);
            }
            return completed;
        } finally {
            Files.deleteIfExists(partial);
            Files.deleteIfExists(snapshot);
            Files.deleteIfExists(staging);
        }
    }

    private static void add(ZipOutputStream zip, Path file, String name, Properties manifest) throws Exception {
        MessageDigest digest = MessageDigest.getInstance("SHA-256");
        zip.putNextEntry(new ZipEntry(name));
        try (var input = new DigestInputStream(Files.newInputStream(file), digest)) {
            input.transferTo(zip);
        }
        zip.closeEntry();
        manifest.setProperty("sha256." + name, HexFormat.of().formatHex(digest.digest()));
    }
}
