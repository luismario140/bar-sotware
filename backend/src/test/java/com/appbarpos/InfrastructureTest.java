package com.appbarpos;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.nio.file.Files;
import java.nio.file.Path;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import org.springframework.beans.factory.annotation.Value;
import javax.sql.DataSource;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.transaction.PlatformTransactionManager;

@SpringBootTest(classes = AppBarPosApplication.class,
        properties = "logging.file.name=${java.io.tmpdir}/AppBarPOS-tests/backend.log",
        webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class InfrastructureTest {
    private static final Path DATA = temporaryDirectory();

    private static Path temporaryDirectory() {
        try {
            return Files.createTempDirectory("appbarpos-test-");
        } catch (java.io.IOException exception) {
            throw new java.io.UncheckedIOException(exception);
        }
    }

    @DynamicPropertySource
    static void properties(DynamicPropertyRegistry registry) {
        registry.add("appbarpos.data-dir", DATA::toString);
    }

    @Autowired DataSource dataSource;
    @Autowired JdbcTemplate jdbc;
    @Autowired Flyway flyway;
    @Autowired PasswordEncoder pinEncoder;
    @Autowired PlatformTransactionManager transactions;
    @Value("${local.server.port}") int port;

    @Test
    void healthChecksDatabaseAndShutdownRequiresProcessToken() throws Exception {
        try (var client = HttpClient.newHttpClient()) {
            URI base = URI.create("http://127.0.0.1:" + port);
            var health = client.send(HttpRequest.newBuilder(base.resolve("/api/system/health")).GET().build(),
                    HttpResponse.BodyHandlers.ofString());
            assertThat(health.statusCode()).isEqualTo(200);
            assertThat(health.body()).contains("\"status\":\"UP\"", "\"database\":\"UP\"");
            var shutdown = client.send(HttpRequest.newBuilder(base.resolve("/api/system/shutdown"))
                    .POST(HttpRequest.BodyPublishers.noBody()).build(), HttpResponse.BodyHandlers.ofString());
            assertThat(shutdown.statusCode()).isEqualTo(401);
        }
    }

    @Test
    void sqliteEnforcesIntegrityOnFreshConnections() throws Exception {
        assertThat(Files.exists(DATA.resolve("data/bar.db"))).isTrue();
        for (int index = 0; index < 2; index++) {
            try (var connection = dataSource.getConnection(); var statement = connection.createStatement()) {
                try (var result = statement.executeQuery("PRAGMA foreign_keys")) {
                    assertThat(result.next()).isTrue();
                    assertThat(result.getInt(1)).isEqualTo(1);
                }
                try (var result = statement.executeQuery("PRAGMA journal_mode")) {
                    assertThat(result.next()).isTrue();
                    assertThat(result.getString(1)).isEqualToIgnoringCase("wal");
                }
                try (var result = statement.executeQuery("PRAGMA synchronous")) {
                    assertThat(result.next()).isTrue();
                    assertThat(result.getInt(1)).isEqualTo(2);
                }
                statement.execute("CREATE TEMP TABLE parent_test (id INTEGER PRIMARY KEY)");
                statement.execute("CREATE TEMP TABLE child_test (parent_id INTEGER REFERENCES parent_test(id))");
                assertThatThrownBy(() -> statement.execute("INSERT INTO child_test VALUES (999)"))
                        .isInstanceOf(java.sql.SQLException.class);
                statement.execute("DROP TABLE child_test");
                statement.execute("DROP TABLE parent_test");
            }
        }
    }

    @Test
    void migrationsAreRepeatableAndDataSurvivesNewConnections() throws Exception {
        assertThat(flyway.migrate().migrationsExecuted).isZero();
        try (var connection = dataSource.getConnection(); var statement = connection.createStatement();
             var result = statement.executeQuery("SELECT metadata_value FROM app_metadata")) {
            assertThat(result.next()).isTrue();
            assertThat(result.getString(1)).isEqualTo("AppBarPOS");
        }
        assertThat(flyway.validateWithResult().validationSuccessful).isTrue();
    }

    @Test
    void failedTransactionDoesNotLeavePartialWrites() {
        var transaction = new TransactionTemplate(transactions);
        assertThatThrownBy(() -> transaction.executeWithoutResult(status -> {
            jdbc.update("INSERT INTO app_metadata VALUES ('rollback-test', 'temporary')");
            throw new IllegalStateException("Fallo controlado");
        })).isInstanceOf(IllegalStateException.class);
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM app_metadata WHERE metadata_key = 'rollback-test'",
                Integer.class)).isZero();
    }

    @Test
    void pinHashUsesRandomSaltAndRejectsIncorrectPin() {
        // Valores exclusivos de prueba, sin crear cuentas ni credenciales de producción.
        String pin = "731849";
        String first = pinEncoder.encode(pin);
        String second = pinEncoder.encode(pin);
        assertThat(first).isNotEqualTo(pin).isNotEqualTo(second);
        assertThat(pinEncoder.matches(pin, first)).isTrue();
        assertThat(pinEncoder.matches("000000", first)).isFalse();
    }
}
