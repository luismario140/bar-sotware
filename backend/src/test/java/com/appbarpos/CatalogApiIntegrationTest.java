package com.appbarpos;

import static org.assertj.core.api.Assertions.assertThat;

import com.appbarpos.catalog.api.ProductCommands;
import com.appbarpos.catalog.domain.Product;
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
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import tools.jackson.databind.json.JsonMapper;

@SpringBootTest(classes = AppBarPosApplication.class,
        properties = "logging.file.name=${java.io.tmpdir}/AppBarPOS-tests/catalog.log",
        webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class CatalogApiIntegrationTest {
    static final String TOKEN = UUID.randomUUID().toString();
    static final Path DATA = temporaryDirectory();
    @Value("${local.server.port}") int port;
    final JsonMapper json = JsonMapper.builder().build();

    static Path temporaryDirectory() {
        try { return Files.createTempDirectory("appbarpos-catalog-api-"); }
        catch (java.io.IOException failure) { throw new java.io.UncheckedIOException(failure); }
    }
    @DynamicPropertySource
    static void properties(DynamicPropertyRegistry registry) {
        registry.add("appbarpos.data-dir", DATA::toString);
        registry.add("appbarpos.api-token", () -> TOKEN);
    }

    @Test
    void catalogAndImagesRequireSessionAndReturnConsistentData() throws Exception {
        try (var client = HttpClient.newBuilder().cookieHandler(new CookieManager(null, CookiePolicy.ACCEPT_ALL)).build()) {
            assertThat(send(client, "GET", "/api/products", null).statusCode()).isEqualTo(401);
            var setup = send(client, "POST", "/api/auth/setup", "{\"username\":\"catalog-api-test\",\"pin\":\"001234\"}");
            assertThat(setup.statusCode()).isEqualTo(201);
            assertThat(send(client, "GET", "/api/products", null).body()).isEqualTo("[]");
            var command = new ProductCommands.Save(UUID.randomUUID().toString(), null, "Mi producto", "Cervezas", true, "5000,50", null, CatalogServiceTest.png(8, 8), false);
            var created = send(client, "POST", "/api/products", json.writeValueAsString(command));
            assertThat(created.statusCode()).isEqualTo(201);
            Product product = json.readValue(created.body(), Product.class);
            assertThat(product.unitPriceMinor()).isEqualTo(500050);
            assertThat(send(client, "POST", "/api/products", json.writeValueAsString(command)).body()).isEqualTo(created.body());
            assertThat(json.readValue(send(client, "GET", "/api/products", null).body(), Product[].class)).hasSize(1);
            var imageRequest = request("/api/products/" + product.id() + "/image").GET().build();
            var image = client.send(imageRequest, HttpResponse.BodyHandlers.ofByteArray());
            assertThat(image.statusCode()).isEqualTo(200);
            assertThat(image.headers().firstValue("Content-Type")).contains("image/png");
            assertThat(image.headers().firstValue("X-Content-Type-Options")).contains("nosniff");
            assertThat(javax.imageio.ImageIO.read(new java.io.ByteArrayInputStream(image.body())).getWidth()).isEqualTo(8);
            assertThat(send(client, "POST", "/api/products/" + product.id() + "/status",
                    json.writeValueAsString(new ProductCommands.Status(UUID.randomUUID().toString(), 1, false))).statusCode()).isEqualTo(200);
            send(client, "POST", "/api/auth/logout", null);
            assertThat(send(client, "GET", "/api/products/" + product.id() + "/image", null).statusCode()).isEqualTo(401);
        }
    }

    HttpRequest.Builder request(String path) {
        return HttpRequest.newBuilder(URI.create("http://127.0.0.1:" + port + path)).header("X-AppBarPOS-Token", TOKEN);
    }
    HttpResponse<String> send(HttpClient client, String method, String path, String body) throws Exception {
        var builder = request(path);
        if (body != null) builder.header("Content-Type", "application/json");
        builder.method(method, body == null ? HttpRequest.BodyPublishers.noBody() : HttpRequest.BodyPublishers.ofString(body));
        return client.send(builder.build(), HttpResponse.BodyHandlers.ofString());
    }
}
