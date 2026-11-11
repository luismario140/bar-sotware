package com.appbarpos;

import static org.assertj.core.api.Assertions.assertThat;

import java.net.CookieManager;
import java.net.CookiePolicy;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;

@SpringBootTest(classes = AppBarPosApplication.class,
        properties = "logging.file.name=${java.io.tmpdir}/AppBarPOS-tests/auth.log",
        webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class AuthFlowIntegrationTest {
    static final String TOKEN = UUID.randomUUID().toString();
    static final Path DATA = temporaryDirectory();
    @Value("${local.server.port}") int port;
    @Autowired JdbcTemplate jdbc;
    @Autowired PasswordEncoder encoder;

    private static Path temporaryDirectory() {
        try { return Files.createTempDirectory("appbarpos-auth-test-"); }
        catch (java.io.IOException exception) { throw new java.io.UncheckedIOException(exception); }
    }

    @DynamicPropertySource
    static void properties(DynamicPropertyRegistry registry) {
        registry.add("appbarpos.data-dir", DATA::toString);
        registry.add("appbarpos.api-token", () -> TOKEN);
    }

    @Test
    void completeAdministrativeAccessWithoutLosingDataOrExposingCredentials() throws Exception {
        try (var first = client(); var second = client(); var anonymous = client()) {
            assertThat(send(anonymous, "session", null, false).statusCode()).isEqualTo(401);
            assertThat(send(first, "session", null, true).body()).contains("\"configured\":false", "\"authenticated\":false");
            assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM administrator", Integer.class)).isZero();

            var setup = send(first, "setup", credentials("operator-test", "004731"), true);
            assertThat(setup.statusCode()).isEqualTo(201);
            assertThat(setup.headers().firstValue("Set-Cookie").orElseThrow())
                    .contains("APPBARPOS_SESSION=", "HttpOnly", "SameSite=Strict", "Path=/api");
            assertThat(setup.headers().firstValue("Cache-Control")).contains("no-store");
            assertThat(setup.body()).doesNotContain("004731", "pinHash", "pin_hash", TOKEN);
            String hash = jdbc.queryForObject("SELECT pin_hash FROM administrator", String.class);
            assertThat(hash).startsWith("{pbkdf2@SpringSecurity_v5_8}").doesNotContain("004731");
            assertThat(encoder.matches("004731", hash)).isTrue();
            assertThat(send(second, "setup", credentials("other-test", "998877"), true).statusCode()).isEqualTo(409);
            assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM administrator", Integer.class)).isEqualTo(1);

            assertThat(send(anonymous, "credentials", change("004731", "intruder", "123456"), true).statusCode()).isEqualTo(401);
            var originRequest = HttpRequest.newBuilder(uri("session")).header("X-AppBarPOS-Token", TOKEN)
                    .header("Origin", "https://untrusted.example").GET().build();
            assertThat(anonymous.send(originRequest, HttpResponse.BodyHandlers.ofString()).statusCode()).isEqualTo(403);

            assertThat(send(second, "login", credentials("wrong-user", "004731"), true).body())
                    .isEqualTo(send(second, "login", credentials("operator-test", "555555"), true).body());
            assertThat(send(second, "login", credentials("operator-test", "004731"), true).statusCode()).isEqualTo(200);

            jdbc.update("INSERT INTO app_metadata VALUES ('business-sentinel', 'unchanged')");
            assertThat(send(first, "credentials", change("555555", "updated-test", "001982"), true).statusCode()).isEqualTo(401);
            assertThat(jdbc.queryForObject("SELECT username FROM administrator", String.class)).isEqualTo("operator-test");
            assertThat(send(first, "credentials", change("004731", "updated-test", "001982"), true).statusCode()).isEqualTo(204);
            assertThat(send(first, "session", null, true).body()).contains("\"authenticated\":false");
            assertThat(send(second, "session", null, true).body()).contains("\"authenticated\":false");
            assertThat(send(second, "credentials", change("001982", "invalid", "001983"), true).statusCode()).isEqualTo(401);
            assertThat(send(first, "login", credentials("operator-test", "004731"), true).statusCode()).isEqualTo(401);
            var login = send(first, "login", credentials("updated-test", "001982"), true);
            assertThat(login.statusCode()).isEqualTo(200);
            assertThat(login.body()).contains("updated-test");
            assertThat(jdbc.queryForObject("SELECT id FROM administrator", Integer.class)).isEqualTo(1);
            assertThat(jdbc.queryForObject("SELECT metadata_value FROM app_metadata WHERE metadata_key = 'business-sentinel'", String.class)).isEqualTo("unchanged");

            assertThat(send(first, "logout", null, true).statusCode()).isEqualTo(204);
            assertThat(send(first, "session", null, true).body()).contains("\"authenticated\":false");
            assertThat(send(first, "logout", null, true).statusCode()).isEqualTo(204);

            for (int attempt = 1; attempt <= 5; attempt++) {
                assertThat(send(first, "login", credentials("updated-test", "999999"), true).statusCode())
                        .isEqualTo(attempt < 5 ? 401 : 429);
            }
            var blocked = send(first, "login", credentials("updated-test", "001982"), true);
            assertThat(blocked.statusCode()).isEqualTo(429);
            assertThat(Long.parseLong(blocked.headers().firstValue("Retry-After").orElseThrow())).isPositive();
            assertThat(jdbc.queryForObject("SELECT locked_until FROM administrator", Long.class)).isGreaterThan(System.currentTimeMillis());
            assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM administrator_audit WHERE action = 'CREDENTIALS_CHANGED'", Integer.class)).isEqualTo(1);
        }
    }

    private HttpClient client() {
        return HttpClient.newBuilder().cookieHandler(new CookieManager(null, CookiePolicy.ACCEPT_ALL)).build();
    }

    private URI uri(String action) { return URI.create("http://127.0.0.1:" + port + "/api/auth/" + action); }

    private HttpResponse<String> send(HttpClient client, String action, String body, boolean token) throws Exception {
        var request = HttpRequest.newBuilder(uri(action));
        if (token) request.header("X-AppBarPOS-Token", TOKEN);
        if (body != null) request.header("Content-Type", "application/json");
        if (action.equals("session")) request.GET();
        else request.POST(body == null ? HttpRequest.BodyPublishers.noBody() : HttpRequest.BodyPublishers.ofString(body));
        return client.send(request.build(), HttpResponse.BodyHandlers.ofString());
    }

    private String credentials(String username, String pin) {
        return "{\"username\":\"" + username + "\",\"pin\":\"" + pin + "\"}";
    }

    private String change(String currentPin, String username, String pin) {
        return "{\"currentPin\":\"" + currentPin + "\",\"username\":\"" + username + "\",\"pin\":\"" + pin + "\"}";
    }
}
