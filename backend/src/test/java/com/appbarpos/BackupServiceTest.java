package com.appbarpos;

import static org.assertj.core.api.Assertions.*;

import com.appbarpos.backup.*;
import com.appbarpos.infrastructure.database.MigrationBackup;
import com.appbarpos.infrastructure.storage.AppDataPaths;
import java.io.*;
import java.nio.file.*;
import java.security.MessageDigest;
import java.util.*;
import java.util.zip.*;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.jdbc.core.JdbcTemplate;
import org.sqlite.SQLiteDataSource;

class BackupServiceTest {
    @TempDir Path root;
    AppDataPaths paths;
    SQLiteDataSource source;
    JdbcTemplate jdbc;
    BackupService service;
    final String image = UUID.randomUUID().toString();

    @BeforeEach void initialize() throws Exception {
        paths = new AppDataPaths(root.toString());
        source = new SQLiteDataSource();
        source.setUrl("jdbc:sqlite:" + paths.database());
        Flyway flyway = Flyway.configure().dataSource(source).locations("classpath:db/migration").load();
        flyway.migrate();
        jdbc = new JdbcTemplate(source);
        jdbc.update("INSERT INTO app_metadata VALUES ('backup-sentinel', 'before')");
        jdbc.update("INSERT INTO product (id, name, category, active, version, created_at, updated_at, image_id) VALUES (?, 'Producto', 'Cervezas', 1, 1, 0, 0, ?)", UUID.randomUUID().toString(), image);
        Files.write(paths.root().resolve("media/productos/" + image + ".png"), new byte[]{1, 2, 3, 4});
        service = new BackupService(paths, source, flyway, new BackupMaintenance());
    }

    Path archive() throws Exception { return root.resolve("backups").resolve(service.create("manual").filename()); }
    Path staged(BackupService.InspectedBackup selected) { return root.resolve("backups/.restore-" + selected.id()); }
    String currentValue() { return jdbc.queryForObject("SELECT metadata_value FROM app_metadata WHERE metadata_key = 'backup-sentinel'", String.class); }

    @Test void manualBackupIncludesConsistentDatabaseAndImagesWithoutChangingLiveData() throws Exception {
        Path archive = archive();
        jdbc.update("UPDATE app_metadata SET metadata_value = 'after' WHERE metadata_key = 'backup-sentinel'");
        var selected = service.inspect(archive.toString());
        assertThat(selected.createdAt()).isNotBlank();
        assertThat(Files.readAllBytes(staged(selected).resolve("media/productos/" + image + ".png"))).containsExactly(1, 2, 3, 4);
        try (var connection = java.sql.DriverManager.getConnection("jdbc:sqlite:" + staged(selected).resolve("data/bar.db")); var query = connection.createStatement(); var value = query.executeQuery("SELECT metadata_value FROM app_metadata WHERE metadata_key = 'backup-sentinel'")) {
            assertThat(value.next()).isTrue(); assertThat(value.getString(1)).isEqualTo("before");
        }
        assertThat(currentValue()).isEqualTo("after");
        assertThat(service.list()).hasSize(1);
        assertThat(service.list().getFirst().kind()).isEqualTo("manual");
    }

    @Test void rejectsModifiedDatabaseAndMissingImages() throws Exception {
        Path archive = archive();
        var files = read(archive);
        files.put("data/bar.db", new byte[]{1, 2, 3});
        Path corrupted = write(files, false);
        assertThatThrownBy(() -> service.inspect(corrupted.toString())).isInstanceOf(BackupException.class);
        files = read(archive);
        files.remove("media/productos/" + image + ".png");
        Path missing = write(files, false);
        assertThatThrownBy(() -> service.inspect(missing.toString())).isInstanceOf(BackupException.class);
        // Incluso un manifiesto rehecho no puede ocultar una imagen referenciada por la base.
        assertThatThrownBy(() -> service.inspect(write(read(missing), true).toString())).isInstanceOf(BackupException.class);
        assertThat(currentValue()).isEqualTo("before");
    }

    @Test void rejectsTraversalAndUnrelatedZipFilesWithoutWritingOutsideStaging() throws Exception {
        var files = read(archive());
        files.put("../escape.txt", new byte[]{1});
        assertThatThrownBy(() -> service.inspect(write(files, false).toString())).isInstanceOf(BackupException.class);
        assertThat(root.resolve("backups/escape.txt")).doesNotExist();
        assertThatThrownBy(() -> service.inspect(write(Map.of("notes.txt", new byte[]{1}), false).toString())).isInstanceOf(BackupException.class);
        assertThat(currentValue()).isEqualTo("before");
    }

    @Test void rejectsFutureOrIncompatibleMigrationHistory() throws Exception {
        Path archive = archive();
        var files = read(archive);
        Path future = root.resolve("future.db");
        Files.write(future, files.get("data/bar.db"));
        try (var connection = java.sql.DriverManager.getConnection("jdbc:sqlite:" + future); var update = connection.createStatement()) {
            update.executeUpdate("UPDATE flyway_schema_history SET version = '999' WHERE version = '9'");
        }
        files.put("data/bar.db", Files.readAllBytes(future));
        assertThatThrownBy(() -> service.inspect(write(files, true).toString())).isInstanceOf(BackupException.class);
        assertThat(currentValue()).isEqualTo("before");
    }

    @Test void createsSafetyCopyBeforePreparingAndInvalidatesRestoredRecoveryCode() throws Exception {
        jdbc.update("UPDATE administrator_recovery SET code_hash = 'old-code-hash', expires_at = 9999999999999");
        var selected = service.inspect(archive().toString());
        jdbc.update("UPDATE app_metadata SET metadata_value = 'latest' WHERE metadata_key = 'backup-sentinel'");
        var prepared = service.prepare(selected.id());
        assertThat(prepared.safetyBackup()).startsWith("pre-restore-");
        assertThat(root.resolve("backups").resolve(prepared.safetyBackup())).exists();
        assertThat(currentValue()).isEqualTo("latest");
        try (var connection = java.sql.DriverManager.getConnection("jdbc:sqlite:" + staged(selected).resolve("data/bar.db")); var query = connection.createStatement(); var value = query.executeQuery("SELECT code_hash FROM administrator_recovery")) {
            assertThat(value.next()).isTrue(); assertThat(value.getString(1)).isNull();
        }
        assertThat(jdbc.queryForObject("SELECT code_hash FROM administrator_recovery", String.class)).isEqualTo("old-code-hash");
        service.cancel();
        assertThat(staged(selected)).doesNotExist();
        assertThat(service.list()).hasSize(2);
    }

    @Test void acceptsOlderCompatibleBackupAndDoesNotModifyCurrentDatabase() throws Exception {
        var oldPaths = new AppDataPaths(root.resolve("older").toString());
        var older = new SQLiteDataSource(); older.setUrl("jdbc:sqlite:" + oldPaths.database());
        Flyway.configure().dataSource(older).locations("classpath:db/migration").target("2").load().migrate();
        Path archive = MigrationBackup.create(older, oldPaths);
        var selected = service.inspect(archive.toString());
        assertThat(staged(selected).resolve("data/bar.db")).exists();
        assertThat(currentValue()).isEqualTo("before");
        service.prepare(selected.id());
        service.cancel();
    }

    private Map<String, byte[]> read(Path archive) throws Exception {
        var files = new LinkedHashMap<String, byte[]>();
        try (var zip = new ZipFile(archive.toFile())) {
            for (var entries = zip.entries(); entries.hasMoreElements();) {
                var entry = entries.nextElement();
                try (var input = zip.getInputStream(entry)) { files.put(entry.getName(), input.readAllBytes()); }
            }
        }
        return files;
    }
    private Path write(Map<String, byte[]> contents, boolean updateManifest) throws Exception {
        var files = new LinkedHashMap<>(contents);
        if (updateManifest) {
            var manifest = new Properties();
            manifest.load(new ByteArrayInputStream(files.get("manifest.properties")));
            manifest.keySet().removeIf(key -> key.toString().startsWith("sha256."));
            for (var item : files.entrySet()) if (!item.getKey().equals("manifest.properties")) manifest.setProperty("sha256." + item.getKey(), HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(item.getValue())));
            var output = new ByteArrayOutputStream(); manifest.store(output, "test"); files.put("manifest.properties", output.toByteArray());
        }
        Path file = root.resolve(UUID.randomUUID() + ".zip");
        try (var zip = new ZipOutputStream(Files.newOutputStream(file))) {
            for (var item : files.entrySet()) { zip.putNextEntry(new ZipEntry(item.getKey())); zip.write(item.getValue()); zip.closeEntry(); }
        }
        return file;
    }
}
