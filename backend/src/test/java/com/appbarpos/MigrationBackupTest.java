package com.appbarpos;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.appbarpos.infrastructure.database.DatabaseConfiguration;
import com.appbarpos.infrastructure.storage.AppDataPaths;
import java.nio.file.Files;
import java.nio.file.Path;
import java.security.MessageDigest;
import java.util.HexFormat;
import java.util.Properties;
import java.util.zip.ZipFile;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.jdbc.core.JdbcTemplate;
import org.sqlite.SQLiteDataSource;

class MigrationBackupTest {
    @TempDir Path root;

    @Test
    void upgradingFromAdministrativeAccessPreservesCredentialsAndMedia() throws Exception {
        var paths = new AppDataPaths(root.toString());
        var configuration = new DatabaseConfiguration();
        try (var source = configuration.dataSource(paths)) {
            Flyway.configure().dataSource(source).locations("classpath:db/migration").target("2").load().migrate();
            var jdbc = new JdbcTemplate(source);
            String pinHash = new com.appbarpos.infrastructure.security.PinHashConfiguration().pinEncoder().encode("001234");
            jdbc.update("INSERT INTO administrator (id, username, pin_hash, created_at, updated_at) VALUES (1, 'existing-test-admin', ?, 0, 0)", pinHash);
            Files.writeString(root.resolve("media/productos/preserved.txt"), "existing-media");
            configuration.flyway(source, paths).migrate();
            assertThat(jdbc.queryForObject("SELECT pin_hash FROM administrator WHERE id = 1", String.class)).isEqualTo(pinHash);
            assertThat(jdbc.queryForObject("SELECT username FROM administrator WHERE id = 1", String.class)).isEqualTo("existing-test-admin");
            assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM product", Integer.class)).isZero();
            assertThat(Files.readString(root.resolve("media/productos/preserved.txt"))).isEqualTo("existing-media");
            try (var backups = Files.list(root.resolve("backups"))) { assertThat(backups.count()).isEqualTo(1); }
        }
    }

    @Test
    void backupFailurePreventsSchemaChanges() throws Exception {
        var paths = new AppDataPaths(root.toString());
        var configuration = new DatabaseConfiguration();
        try (var source = configuration.dataSource(paths)) {
            Flyway.configure().dataSource(source).locations("classpath:db/migration").target("1").load().migrate();
            Files.delete(root.resolve("backups"));
            Files.writeString(root.resolve("backups"), "Obstrucción controlada del directorio de respaldo");
            assertThatThrownBy(() -> configuration.flyway(source, paths)).isInstanceOf(java.io.IOException.class);
            var jdbc = new JdbcTemplate(source);
            assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM sqlite_master WHERE name = 'administrator'", Integer.class)).isZero();
            assertThat(jdbc.queryForObject("SELECT version FROM flyway_schema_history WHERE success = 1 ORDER BY installed_rank DESC LIMIT 1", String.class)).isEqualTo("1");
        }
    }

    @Test
    void upgradeCreatesConsistentPreMigrationBackupWithMediaAndManifest() throws Exception {
        var paths = new AppDataPaths(root.toString());
        var configuration = new DatabaseConfiguration();
        try (var source = configuration.dataSource(paths)) {
            Flyway.configure().dataSource(source).locations("classpath:db/migration").target("1").load().migrate();
            var jdbc = new JdbcTemplate(source);
            jdbc.update("INSERT INTO app_metadata VALUES ('preserved', 'before-upgrade')");
            Files.writeString(root.resolve("media/productos/test-image.txt"), "media-fixture");
            Flyway upgraded = configuration.flyway(source, paths);
            upgraded.migrate();
            assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM administrator", Integer.class)).isZero();
            assertThat(jdbc.queryForObject("SELECT metadata_value FROM app_metadata WHERE metadata_key = 'preserved'", String.class)).isEqualTo("before-upgrade");
            Path archive;
            try (var backups = Files.list(root.resolve("backups"))) {
                var files = backups.toList();
                assertThat(files).hasSize(1);
                archive = files.getFirst();
            }
            try (var zip = new ZipFile(archive.toFile())) {
                var manifest = new Properties();
                try (var input = zip.getInputStream(zip.getEntry("manifest.properties"))) { manifest.load(input); }
                byte[] database;
                try (var input = zip.getInputStream(zip.getEntry("data/bar.db"))) { database = input.readAllBytes(); }
                assertThat(manifest.getProperty("sha256.data/bar.db"))
                        .isEqualTo(HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(database)));
                try (var input = zip.getInputStream(zip.getEntry("media/productos/test-image.txt"))) {
                    assertThat(new String(input.readAllBytes(), java.nio.charset.StandardCharsets.UTF_8)).isEqualTo("media-fixture");
                }
                Path restored = root.resolve("restored-test.db");
                Files.write(restored, database);
                var snapshot = new SQLiteDataSource();
                snapshot.setUrl("jdbc:sqlite:" + restored);
                var old = new JdbcTemplate(snapshot);
                assertThat(old.queryForObject("SELECT metadata_value FROM app_metadata WHERE metadata_key = 'preserved'", String.class)).isEqualTo("before-upgrade");
                assertThat(old.queryForObject("SELECT COUNT(*) FROM sqlite_master WHERE name = 'administrator'", Integer.class)).isZero();
                assertThat(old.queryForObject("PRAGMA integrity_check", String.class)).isEqualTo("ok");
            }
            configuration.flyway(source, paths).migrate();
            try (var backups = Files.list(root.resolve("backups"))) { assertThat(backups.count()).isEqualTo(1); }
        }
    }
}
