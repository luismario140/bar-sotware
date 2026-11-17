package com.appbarpos;

import static org.assertj.core.api.Assertions.assertThat;

import com.appbarpos.backup.BackupService;
import java.net.*;
import java.net.http.*;
import java.nio.file.*;
import java.util.*;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import tools.jackson.databind.json.JsonMapper;

@SpringBootTest(classes = AppBarPosApplication.class, properties = "logging.file.name=${java.io.tmpdir}/AppBarPOS-tests/backups.log", webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class BackupApiIntegrationTest {
    static final String TOKEN = UUID.randomUUID().toString();
    static final Path DATA = temporaryDirectory();
    @Value("${local.server.port}") int port;
    final JsonMapper json = JsonMapper.builder().build();

    static Path temporaryDirectory() { try { return Files.createTempDirectory("appbarpos-backup-api-"); } catch (Exception failure) { throw new IllegalStateException(failure); } }
    @DynamicPropertySource static void properties(DynamicPropertyRegistry registry) { registry.add("appbarpos.data-dir", DATA::toString); registry.add("appbarpos.api-token", () -> TOKEN); }

    @Test void backupEndpointsRequireSessionAndRestorePreparationRequiresPinAndFreezesChanges() throws Exception {
        try (var client = HttpClient.newBuilder().cookieHandler(new CookieManager(null, CookiePolicy.ACCEPT_ALL)).build()) {
            assertThat(send(client, "GET", "/api/backups", null).statusCode()).isEqualTo(401);
            assertThat(send(client, "POST", "/api/backups/create", null).statusCode()).isEqualTo(401);
            assertThat(send(client, "POST", "/api/auth/setup", Map.of("username", "backup-admin", "pin", "0012", "recoveryEmail", "admin@example.com")).statusCode()).isEqualTo(201);
            var created = send(client, "POST", "/api/backups/create", null);
            assertThat(created.statusCode()).isEqualTo(200);
            var file = json.readValue(created.body(), BackupService.BackupFile.class);
            assertThat(send(client, "GET", "/api/backups", null).body()).contains(file.filename());
            var inspected = send(client, "POST", "/api/backups/inspect", Map.of("path", DATA.resolve("backups").resolve(file.filename()).toString()));
            assertThat(inspected.statusCode()).isEqualTo(200);
            var selection = json.readValue(inspected.body(), BackupService.InspectedBackup.class);
            assertThat(send(client, "POST", "/api/backups/prepare-restore", Map.of("id", selection.id(), "currentPin", "9999")).statusCode()).isEqualTo(401);
            assertThat(send(client, "GET", "/api/products", null).statusCode()).isEqualTo(200);
            var prepared = send(client, "POST", "/api/backups/prepare-restore", Map.of("id", selection.id(), "currentPin", "0012"));
            assertThat(prepared.statusCode()).isEqualTo(200);
            assertThat(prepared.body()).contains("pre-restore-");
            assertThat(send(client, "GET", "/api/products", null).statusCode()).isEqualTo(503);
            assertThat(send(client, "POST", "/api/auth/login", Map.of("username", "backup-admin", "pin", "0012")).statusCode()).isEqualTo(503);
            assertThat(send(client, "GET", "/api/system/health", null).statusCode()).isEqualTo(200);
            assertThat(send(client, "POST", "/api/backups/cancel-restore", null).statusCode()).isEqualTo(204);
            assertThat(send(client, "GET", "/api/products", null).statusCode()).isEqualTo(200);
            assertThat(DATA.resolve("backups/.restore-" + selection.id())).doesNotExist();
        }
    }

    HttpResponse<String> send(HttpClient client, String method, String relative, Map<String, String> payload) throws Exception {
        var request = HttpRequest.newBuilder(URI.create("http://127.0.0.1:" + port + relative)).header("X-AppBarPOS-Token", TOKEN);
        if (payload != null) request.header("Content-Type", "application/json");
        request.method(method, payload == null ? HttpRequest.BodyPublishers.noBody() : HttpRequest.BodyPublishers.ofString(json.writeValueAsString(payload)));
        return client.send(request.build(), HttpResponse.BodyHandlers.ofString());
    }
}
