package com.appbarpos.backup;

import com.appbarpos.infrastructure.database.MigrationBackup;
import com.appbarpos.infrastructure.storage.AppDataPaths;
import java.io.InputStream;
import java.nio.file.*;
import java.security.MessageDigest;
import java.time.Instant;
import java.util.*;
import java.util.regex.Pattern;
import java.util.zip.ZipFile;
import javax.sql.DataSource;
import org.flywaydb.core.Flyway;
import org.springframework.stereotype.Service;

@Service
public class BackupService {
    private static final Pattern FILE = Pattern.compile("(pre-migration|manual|pre-restore)-(\\d+)-[0-9a-fA-F-]{36}\\.zip");
    private static final long MAX_ARCHIVE = 512L * 1024 * 1024;
    private static final long MAX_EXPANDED = 2L * 1024 * 1024 * 1024;
    private final AppDataPaths paths;
    private final DataSource source;
    private final Flyway flyway;
    private final BackupMaintenance maintenance;
    private InspectedBackup inspected;

    public BackupService(AppDataPaths paths, DataSource source, Flyway flyway, BackupMaintenance maintenance) {
        this.paths = paths; this.source = source; this.flyway = flyway; this.maintenance = maintenance;
    }

    public synchronized List<BackupFile> list() throws Exception {
        try (var entries = Files.list(paths.root().resolve("backups"))) {
            var result = new ArrayList<BackupFile>();
            for (Path file : entries.toList()) {
                var match = FILE.matcher(file.getFileName().toString());
                if (!match.matches() || !Files.isRegularFile(file, LinkOption.NOFOLLOW_LINKS)) continue;
                try {
                    long timestamp = Long.parseLong(match.group(2));
                    if (timestamp <= 0 || timestamp > 8640000000000000L) continue;
                    result.add(new BackupFile(file.getFileName().toString(), Instant.ofEpochMilli(timestamp).toString(), Files.size(file), match.group(1)));
                }
                catch (IllegalArgumentException ignored) { /* No publicar archivos con nombres inválidos. */ }
            }
            result.sort(Comparator.comparing((BackupFile file) -> Instant.parse(file.createdAt())).reversed());
            return result;
        }
    }

    public synchronized BackupFile create(String purpose) throws Exception {
        Path file = MigrationBackup.create(source, paths, purpose);
        return list().stream().filter(item -> item.filename().equals(file.getFileName().toString())).findFirst().orElseThrow();
    }

    public synchronized InspectedBackup inspect(String selected) throws Exception {
        clearInspection();
        Path archive;
        try { archive = Path.of(selected); } catch (Exception invalid) { throw new BackupException("Selecciona un archivo ZIP de AppBarPOS."); }
        if (!Files.isRegularFile(archive, LinkOption.NOFOLLOW_LINKS) || Files.size(archive) > MAX_ARCHIVE) throw new BackupException("Selecciona un respaldo ZIP de hasta 512 MB.");
        String id = UUID.randomUUID().toString();
        Path staging = stage(id);
        Files.createDirectory(staging);
        try {
            String createdAt = extract(archive, staging);
            validateDatabase(staging.resolve("data/bar.db"));
            Files.createDirectories(staging.resolve("media/productos"));
            inspected = new InspectedBackup(id, archive.getFileName().toString(), createdAt, Instant.now().plusSeconds(900).toString());
            return inspected;
        } catch (Exception failure) {
            deleteStaging(staging);
            if (failure instanceof BackupException rejection) throw rejection;
            throw new BackupException("El archivo no es un respaldo válido o está dañado. No se modificaron tus datos.");
        }
    }

    public synchronized PreparedRestore prepare(String id) throws Exception {
        if (inspected == null || !inspected.id().equals(id) || Instant.parse(inspected.expiresAt()).isBefore(Instant.now())) throw new BackupException("Vuelve a seleccionar el respaldo antes de restaurar.");
        validateDatabase(stage(id).resolve("data/bar.db"));
        BackupFile safety = create("pre-restore");
        // No trasladar códigos de recuperación a la instalación restaurada.
        try (var connection = java.sql.DriverManager.getConnection("jdbc:sqlite:" + stage(id).resolve("data/bar.db")); var statement = connection.createStatement()) {
            try (var tables = statement.executeQuery("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'administrator_recovery'")) {
                if (tables.next()) {
                    tables.close();
                    statement.executeUpdate("UPDATE administrator_recovery SET code_hash = NULL, email = NULL, expires_at = 0");
                }
            }
            statement.execute("PRAGMA wal_checkpoint(TRUNCATE)");
        }
        maintenance.restoring(true);
        return new PreparedRestore(id, safety.filename());
    }

    public synchronized void cancel() throws Exception { maintenance.restoring(false); clearInspection(); }

    private String extract(Path archive, Path staging) throws Exception {
        var digests = new HashMap<String, String>();
        var names = new HashSet<String>();
        Properties manifest = new Properties();
        long expanded = 0;
        try (var zip = new ZipFile(archive.toFile())) {
            var entries = zip.entries();
            while (entries.hasMoreElements()) {
                var entry = entries.nextElement();
                String name = entry.getName();
                if (names.size() >= 20000 || !names.add(name) || name.contains("\\") || name.contains(":")) throw new BackupException("El ZIP contiene rutas o archivos no permitidos.");
                Path target = staging.resolve(name).normalize();
                if (!target.startsWith(staging) || target.equals(staging)) throw new BackupException("El ZIP contiene rutas no permitidas.");
                if (entry.isDirectory()) {
                    if (!Set.of("data/", "media/", "media/productos/").contains(name)) throw new BackupException("El ZIP contiene carpetas no permitidas.");
                    continue;
                }
                if (!name.equals("manifest.properties") && !name.equals("data/bar.db") && !name.matches("media/productos/[a-zA-Z0-9._-]+")) throw new BackupException("El ZIP contiene archivos no permitidos.");
                MessageDigest digest = MessageDigest.getInstance("SHA-256");
                Files.createDirectories(target.getParent());
                try (InputStream input = zip.getInputStream(entry); var output = Files.newOutputStream(target, StandardOpenOption.CREATE_NEW)) {
                    byte[] buffer = new byte[65536];
                    int read;
                    long entrySize = 0;
                    while ((read = input.read(buffer)) != -1) {
                        expanded += read; entrySize += read;
                        if (expanded > MAX_EXPANDED || (name.equals("manifest.properties") && entrySize > 4 * 1024 * 1024)) throw new BackupException("El contenido del respaldo supera el tamaño permitido.");
                        output.write(buffer, 0, read); digest.update(buffer, 0, read);
                    }
                }
                if (!name.equals("manifest.properties")) digests.put(name, HexFormat.of().formatHex(digest.digest()));
            }
        }
        Path manifestPath = staging.resolve("manifest.properties");
        if (!Files.isRegularFile(manifestPath) || !digests.containsKey("data/bar.db")) throw new BackupException("El respaldo no contiene la base de datos y su manifiesto.");
        try (var input = Files.newInputStream(manifestPath)) { manifest.load(input); }
        if (!"appbarpos-backup-v1".equals(manifest.getProperty("format"))) throw new BackupException("Formato de respaldo no compatible.");
        for (var item : digests.entrySet()) {
            if (!item.getValue().equalsIgnoreCase(manifest.getProperty("sha256." + item.getKey(), ""))) throw new BackupException("El respaldo está incompleto o fue modificado.");
        }
        for (String key : manifest.stringPropertyNames()) {
            if (key.startsWith("sha256.") && !digests.containsKey(key.substring(7))) throw new BackupException("Faltan archivos incluidos en el manifiesto.");
        }
        Instant created = Instant.parse(manifest.getProperty("createdAt"));
        if (created.toEpochMilli() <= 0 || created.toEpochMilli() > 8640000000000000L) throw new BackupException("La fecha del respaldo no es válida.");
        return created.toString();
    }

    private void validateDatabase(Path database) throws Exception {
        try (var connection = java.sql.DriverManager.getConnection("jdbc:sqlite:" + database); var statement = connection.createStatement()) {
            try (var check = statement.executeQuery("PRAGMA integrity_check")) {
                if (!check.next() || !"ok".equals(check.getString(1))) throw new BackupException("La base de datos del respaldo está dañada.");
            }
            try (var check = statement.executeQuery("PRAGMA foreign_key_check")) {
                if (check.next()) throw new BackupException("La base de datos del respaldo tiene relaciones incompletas.");
            }
            var expected = new LinkedHashMap<String, Integer>();
            for (var migration : flyway.info().all()) if (migration.getVersion() != null) expected.put(migration.getVersion().toString(), migration.getChecksum());
            var versions = new ArrayList<>(expected.keySet());
            int applied = 0;
            try (var history = statement.executeQuery("SELECT version, checksum, success FROM flyway_schema_history ORDER BY installed_rank")) {
                while (history.next()) {
                    String version = history.getString(1);
                    if (!history.getBoolean(3) || applied >= versions.size() || !versions.get(applied).equals(version) || !Objects.equals(expected.get(version), history.getInt(2))) throw new BackupException("El respaldo pertenece a otra versión del programa o sus migraciones no son compatibles.");
                    applied++;
                }
            }
            if (applied == 0) throw new BackupException("El archivo no contiene una base de datos de AppBarPOS.");
            if (expected.containsKey("3") && applied >= 3) {
                try (var images = statement.executeQuery("SELECT image_id FROM product WHERE image_id IS NOT NULL")) {
                    while (images.next()) {
                        String id = images.getString(1);
                        if (!id.matches("[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}") || !Files.isRegularFile(database.getParent().getParent().resolve("media/productos/" + id + ".png"), LinkOption.NOFOLLOW_LINKS)) throw new BackupException("Faltan imágenes de productos en el respaldo.");
                    }
                }
            }
        }
    }

    private Path stage(String id) { return paths.root().resolve("backups/.restore-" + UUID.fromString(id)); }
    private void clearInspection() throws Exception { if (inspected != null) { deleteStaging(stage(inspected.id())); inspected = null; } }
    private void deleteStaging(Path staging) throws Exception {
        Path parent = paths.root().resolve("backups").toAbsolutePath().normalize();
        if (!staging.toAbsolutePath().normalize().getParent().equals(parent) || !staging.getFileName().toString().startsWith(".restore-")) throw new IllegalArgumentException("Ruta de preparación inválida");
        if (!Files.exists(staging, LinkOption.NOFOLLOW_LINKS)) return;
        try (var files = Files.walk(staging)) { for (Path file : files.sorted(Comparator.reverseOrder()).toList()) Files.delete(file); }
    }

    public record BackupFile(String filename, String createdAt, long sizeBytes, String kind) { }
    public record InspectedBackup(String id, String filename, String createdAt, String expiresAt) { }
    public record PreparedRestore(String id, String safetyBackup) { }
}
