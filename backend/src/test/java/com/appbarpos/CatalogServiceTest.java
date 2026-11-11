package com.appbarpos;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.appbarpos.catalog.api.ProductCommands;
import com.appbarpos.catalog.application.CatalogException;
import com.appbarpos.catalog.application.ProductService;
import com.appbarpos.catalog.infrastructure.ProductImages;
import com.appbarpos.catalog.repository.ProductRepository;
import com.appbarpos.infrastructure.database.DatabaseConfiguration;
import com.appbarpos.infrastructure.security.PinHashConfiguration;
import com.appbarpos.infrastructure.storage.AppDataPaths;
import com.zaxxer.hikari.HikariDataSource;
import java.awt.image.BufferedImage;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Clock;
import java.util.Base64;
import java.util.UUID;
import javax.imageio.ImageIO;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;

class CatalogServiceTest {
    @TempDir Path root;
    HikariDataSource source;
    JdbcTemplate jdbc;
    ProductService service;

    @BeforeEach
    void initialize() throws Exception {
        var paths = new AppDataPaths(root.toString());
        source = new DatabaseConfiguration().dataSource(paths);
        Flyway.configure().dataSource(source).locations("classpath:db/migration").load().migrate();
        jdbc = new JdbcTemplate(source);
        jdbc.update("INSERT INTO administrator (id, username, pin_hash, created_at, updated_at) VALUES (1, 'catalog-test', ?, 0, 0)",
                new PinHashConfiguration().pinEncoder().encode("001234"));
        service = new ProductService(new ProductRepository(jdbc), new ProductImages(paths), new DataSourceTransactionManager(source), Clock.systemUTC());
    }

    @AfterEach void close() { if (source != null) source.close(); }

    ProductCommands.Save input(String operation, Integer version, String name, String unit, String shot, String image, boolean remove) {
        return new ProductCommands.Save(operation, version, name, "Licores", true, unit, shot, image, remove);
    }

    @Test
    void retriesReturnOriginalResultAndStaleEditsCannotOverwritePrices() throws Exception {
        var command = input(UUID.randomUUID().toString(), null, "  Producto propio  ", "12000,50", null, null, false);
        var first = service.save(null, command, 1);
        assertThat(first.unitPriceMinor()).isEqualTo(1200050);
        assertThat(first.shotPriceMinor()).isNull();
        assertThat(service.list().getFirst()).isEqualTo(first);
        String presentationId = jdbc.queryForObject("SELECT id FROM sale_presentation", String.class);
        var edit = input(UUID.randomUUID().toString(), 1, "Producto editado", "13000", "5000", null, false);
        var updated = service.save(first.id(), edit, 1);
        assertThat(updated.version()).isEqualTo(2);
        assertThat(jdbc.queryForObject("SELECT id FROM sale_presentation WHERE kind = 'UNIT'", String.class)).isEqualTo(presentationId);
        assertThat(service.save(null, command, 1)).isEqualTo(first);
        assertThat(service.find(first.id())).isEqualTo(updated);
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM product_operation", Integer.class)).isEqualTo(2);
        assertThatThrownBy(() -> service.save(first.id(), input(UUID.randomUUID().toString(), 1, "Obsoleto", "1", null, null, false), 1))
                .isInstanceOfSatisfying(CatalogException.class, error -> assertThat(error.code()).isEqualTo("VERSION_CONFLICT"));
        assertThatThrownBy(() -> service.save(null, input(command.operationId(), null, "Diferente", "1", null, null, false), 1))
                .isInstanceOfSatisfying(CatalogException.class, error -> assertThat(error.code()).isEqualTo("OPERATION_CONFLICT"));
        var shotOnly = service.save(first.id(), input(UUID.randomUUID().toString(), 2, "Solo shot", null, "5500", null, false), 1);
        assertThat(shotOnly.unitPriceMinor()).isNull();
        assertThat(jdbc.queryForObject("SELECT active FROM sale_presentation WHERE id = ?", Integer.class, presentationId)).isZero();
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM sale_presentation", Integer.class)).isEqualTo(2);
    }

    @Test
    void statusChangesPreserveIdentityAndImmutableHistory() throws Exception {
        var first = service.save(null, input(UUID.randomUUID().toString(), null, "Producto", "0", null, null, false), 1);
        var off = new ProductCommands.Status(UUID.randomUUID().toString(), 1, false);
        var disabled = service.status(first.id(), off, 1);
        assertThat(disabled.active()).isFalse();
        assertThat(disabled.unitPriceMinor()).isZero();
        assertThat(service.status(first.id(), off, 1)).isEqualTo(disabled);
        var enabled = service.status(first.id(), new ProductCommands.Status(UUID.randomUUID().toString(), 2, true), 1);
        assertThat(enabled.id()).isEqualTo(first.id());
        assertThat(enabled.active()).isTrue();
        assertThatThrownBy(() -> jdbc.update("DELETE FROM product")).isInstanceOf(org.springframework.dao.DataAccessException.class);
        assertThatThrownBy(() -> jdbc.update("DELETE FROM product_operation")).isInstanceOf(org.springframework.dao.DataAccessException.class);
    }

    @Test
    void importedImageIsIndependentAndFailedReplacementPreservesCurrentImage() throws Exception {
        Path original = root.resolve("usb-original.png");
        Files.write(original, Base64.getDecoder().decode(png(1500, 800)));
        var first = service.save(null, input(UUID.randomUUID().toString(), null, "Con imagen", "12000", null,
                Base64.getEncoder().encodeToString(Files.readAllBytes(original)), false), 1);
        Files.delete(original);
        BufferedImage imported = ImageIO.read(new ByteArrayInputStream(service.image(first.id())));
        assertThat(imported.getWidth()).isEqualTo(1024);
        assertThat(imported.getHeight()).isBetween(1, 1024);
        assertThatThrownBy(() -> service.save(first.id(), input(UUID.randomUUID().toString(), 1, "Con imagen", "12000", null, "not-base64", false), 1))
                .isInstanceOf(CatalogException.class);
        assertThat(service.find(first.id()).imageId()).isEqualTo(first.imageId());
        jdbc.execute("CREATE TRIGGER fail_product_audit BEFORE INSERT ON product_operation WHEN NEW.action = 'UPDATE' BEGIN SELECT RAISE(ABORT, 'controlled failure'); END");
        assertThatThrownBy(() -> service.save(first.id(), input(UUID.randomUUID().toString(), 1, "Fallido", "1", null, png(12, 12), false), 1))
                .isInstanceOf(org.springframework.dao.DataAccessException.class);
        assertThat(service.find(first.id()).version()).isEqualTo(1);
        try (var files = Files.list(root.resolve("media/productos"))) { assertThat(files.count()).isEqualTo(1); }
        jdbc.execute("DROP TRIGGER fail_product_audit");
        var replacement = service.save(first.id(), input(UUID.randomUUID().toString(), 1, "Con imagen", "12000", null, png(16, 16), false), 1);
        assertThat(replacement.imageId()).isNotEqualTo(first.imageId());
        assertThat(Files.exists(root.resolve("media/productos/" + first.imageId() + ".png"))).isTrue();
        var removed = service.save(first.id(), input(UUID.randomUUID().toString(), 2, "Sin imagen", "12000", null, null, true), 1);
        assertThat(removed.imageId()).isNull();
        assertThatThrownBy(() -> service.image(first.id())).isInstanceOf(CatalogException.class);
    }

    @Test
    void invalidMoneyAndUnsafeImageContentsNeverCreateProducts() throws Exception {
        for (String invalid : new String[]{"-1", "1.001", "1.000,50", "NaN", "999999999999999999999999"}) {
            assertThatThrownBy(() -> service.save(null, input(UUID.randomUUID().toString(), null, "Inválido", invalid, null, null, false), 1)).isInstanceOf(CatalogException.class);
        }
        assertThatThrownBy(() -> service.save(null, input(UUID.randomUUID().toString(), null, "Vacío", null, null, null, false), 1)).isInstanceOf(CatalogException.class);
        String svg = Base64.getEncoder().encodeToString("<svg xmlns='http://www.w3.org/2000/svg'></svg>".getBytes(java.nio.charset.StandardCharsets.UTF_8));
        assertThatThrownBy(() -> service.save(null, input(UUID.randomUUID().toString(), null, "SVG", "1", null, svg, false), 1)).isInstanceOf(CatalogException.class);
        assertThatThrownBy(() -> service.save(null, input(UUID.randomUUID().toString(), null, "Grande", "1", null, png(5000, 1), false), 1)).isInstanceOf(CatalogException.class);
        assertThatThrownBy(() -> service.image("../private")).isInstanceOf(CatalogException.class);
        assertThat(service.list()).isEmpty();
    }

    static String png(int width, int height) throws Exception {
        var image = new BufferedImage(width, height, BufferedImage.TYPE_INT_ARGB);
        image.setRGB(0, 0, 0xffdda455);
        try (var bytes = new ByteArrayOutputStream()) {
            ImageIO.write(image, "png", bytes);
            return Base64.getEncoder().encodeToString(bytes.toByteArray());
        } finally { image.flush(); }
    }
}
