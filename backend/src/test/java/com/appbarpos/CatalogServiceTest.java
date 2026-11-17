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
        return new ProductCommands.Save(operation, version, name, "Cervezas", true, unit, shot, image, remove);
    }

    @Test
    void cancellingAnOpenAccountReleasesReservationsOnceAndKeepsAnImmutableAudit() throws Exception {
        var product = service.save(null, new ProductCommands.Save(UUID.randomUUID().toString(), null,
                "Cerveza", "Cervezas", true, "6000", null, null, false, 2L, 10L), 1);
        var account = service.saveAccount(new ProductCommands.SaveAccount(UUID.randomUUID().toString(), null, null, "EFECTIVO", "Amigos", java.util.List.of(
                new ProductCommands.SaleLine(product.id(), product.version(), new java.math.BigDecimal("3")))), 1);
        assertThat(service.find(product.id()).quantityRemaining()).isEqualTo(7);
        assertThatThrownBy(() -> service.cancelAccount(new ProductCommands.CancelAccount(UUID.randomUUID().toString(), account.id(), 0), 1)).isInstanceOf(CatalogException.class);
        var command = new ProductCommands.CancelAccount(UUID.randomUUID().toString(), account.id(), account.version());
        jdbc.execute("CREATE TRIGGER fail_cancel BEFORE INSERT ON account_cancellation BEGIN SELECT RAISE(ABORT, 'controlled failure'); END");
        assertThatThrownBy(() -> service.cancelAccount(command, 1)).isInstanceOf(org.springframework.dao.DataAccessException.class);
        assertThat(service.find(product.id()).quantityRemaining()).isEqualTo(7);
        assertThat(service.accounts()).containsExactly(account);
        jdbc.execute("DROP TRIGGER fail_cancel");
        var cancellation = service.cancelAccount(command, 1);
        assertThat(service.cancelAccount(command, 1)).isEqualTo(cancellation);
        assertThat(service.find(product.id()).quantityRemaining()).isEqualTo(10);
        assertThat(service.find(product.id()).quantitySold()).isEqualTo(2);
        assertThat(service.accounts()).isEmpty();
        assertThat(service.sales(0).sales()).isEmpty();
        assertThat(service.cancellations()).containsExactly(cancellation);
        assertThat(cancellation.account()).isEqualTo(account);
        assertThat(cancellation.administratorId()).isEqualTo(1);
        assertThatThrownBy(() -> service.cancelAccount(new ProductCommands.CancelAccount(UUID.randomUUID().toString(), account.id(), account.version()), 1)).isInstanceOf(CatalogException.class);
        assertThatThrownBy(() -> service.checkout(new ProductCommands.Checkout(UUID.randomUUID().toString(), java.util.List.of(
                new ProductCommands.SaleLine(product.id(), service.find(product.id()).version(), java.math.BigDecimal.ONE)), "EFECTIVO", null, account.id(), account.version()), 1)).isInstanceOf(CatalogException.class);
        assertThatThrownBy(() -> jdbc.update("DELETE FROM account_cancellation")).isInstanceOf(org.springframework.dao.DataAccessException.class);
        assertThatThrownBy(() -> jdbc.update("UPDATE account_cancellation SET occurred_at = 0")).isInstanceOf(org.springframework.dao.DataAccessException.class);
    }

    @Test
    void aPaidAccountCannotBeCancelled() throws Exception {
        var product = service.save(null, new ProductCommands.Save(UUID.randomUUID().toString(), null,
                "Cerveza", "Cervezas", true, "6000", null, null, false, 0L, 10L), 1);
        var account = service.saveAccount(new ProductCommands.SaveAccount(UUID.randomUUID().toString(), null, null, "EFECTIVO", null,
                java.util.List.of(new ProductCommands.SaleLine(product.id(), product.version(), java.math.BigDecimal.ONE))), 1);
        var sale = service.checkout(new ProductCommands.Checkout(UUID.randomUUID().toString(), java.util.List.of(
                new ProductCommands.SaleLine(product.id(), service.find(product.id()).version(), java.math.BigDecimal.ONE)), "EFECTIVO", null, account.id(), account.version()), 1);
        assertThatThrownBy(() -> service.cancelAccount(new ProductCommands.CancelAccount(UUID.randomUUID().toString(), account.id(), account.version()), 1)).isInstanceOf(CatalogException.class);
        assertThat(service.sales(0).sales()).containsExactly(sale);
        assertThat(service.find(product.id()).quantityRemaining()).isEqualTo(9);
    }

    @Test
    void openAccountsReserveStockCanBeResumedAndAreChargedOnlyOnce() throws Exception {
        var product = service.save(null, new ProductCommands.Save(UUID.randomUUID().toString(), null,
                "Cerveza", "Cervezas", true, "6000", null, null, false, 0L, 10L), 1);
        var command = new ProductCommands.SaveAccount(UUID.randomUUID().toString(), null, null, "EFECTIVO", "  amigos  ", java.util.List.of(
                new ProductCommands.SaleLine(product.id(), product.version(), new java.math.BigDecimal("3"))));
        var account = service.saveAccount(command, 1);
        assertThat(account.name()).isEqualTo("amigos");
        assertThat(service.saveAccount(command, 1)).isEqualTo(account);
        assertThat(service.accounts()).containsExactly(account);
        assertThat(service.find(product.id()).quantityRemaining()).isEqualTo(7);
        assertThat(service.find(product.id()).quantitySold()).isZero();
        assertThat(service.sales(0).sales()).isEmpty();
        var reserved = service.find(product.id());
        assertThatThrownBy(() -> service.delete(product.id(), new ProductCommands.Delete(UUID.randomUUID().toString(), reserved.version()), 1)).isInstanceOf(CatalogException.class);
        var changedPrice = service.save(product.id(), new ProductCommands.Save(UUID.randomUUID().toString(), reserved.version(),
                "Cerveza", "Cervezas", true, "8000", null, null, false), 1);
        var updated = service.saveAccount(new ProductCommands.SaveAccount(UUID.randomUUID().toString(), account.id(), account.version(), "TRANSFERENCIA", null, java.util.List.of(
                new ProductCommands.SaleLine(product.id(), changedPrice.version(), new java.math.BigDecimal("5")))), 1);
        assertThat(updated.totalMinor()).isEqualTo(3_000_000);
        assertThat(updated.name()).isNull();
        assertThat(service.find(product.id()).quantityRemaining()).isEqualTo(5);
        assertThatThrownBy(() -> service.saveAccount(new ProductCommands.SaveAccount(UUID.randomUUID().toString(), account.id(), account.version(), "EFECTIVO", null, command.lines()), 1)).isInstanceOf(CatalogException.class);
        var checkout = new ProductCommands.Checkout(UUID.randomUUID().toString(), java.util.List.of(
                new ProductCommands.SaleLine(product.id(), service.find(product.id()).version(), new java.math.BigDecimal("5"))), "TRANSFERENCIA", null, updated.id(), updated.version());
        jdbc.execute("CREATE TRIGGER fail_account_close BEFORE UPDATE ON customer_account WHEN NEW.status = 'CLOSED' BEGIN SELECT RAISE(ABORT, 'controlled failure'); END");
        assertThatThrownBy(() -> service.checkout(checkout, 1)).isInstanceOf(org.springframework.dao.DataAccessException.class);
        assertThat(service.find(product.id()).quantityRemaining()).isEqualTo(5);
        assertThat(service.find(product.id()).quantitySold()).isZero();
        assertThat(service.sales(0).sales()).isEmpty();
        jdbc.execute("DROP TRIGGER fail_account_close");
        var sale = service.checkout(checkout, 1);
        assertThat(service.checkout(checkout, 1)).isEqualTo(sale);
        assertThat(sale.paymentMethod()).isEqualTo("TRANSFERENCIA");
        assertThat(sale.accountId()).isEqualTo(account.id());
        assertThat(sale.totalMinor()).isEqualTo(3_000_000);
        assertThat(service.find(product.id()).quantityRemaining()).isEqualTo(5);
        assertThat(service.find(product.id()).quantitySold()).isEqualTo(5);
        assertThat(service.accounts()).isEmpty();
        assertThat(service.sales(0).sales()).containsExactly(sale);
        assertThatThrownBy(() -> service.checkout(new ProductCommands.Checkout(UUID.randomUUID().toString(), checkout.lines(), "EFECTIVO", null, updated.id(), updated.version()), 1)).isInstanceOf(CatalogException.class);
    }

    @Test
    void accountEditsReleaseRemovedProductsAndValidatePaymentAndName() throws Exception {
        var first = service.save(null, new ProductCommands.Save(UUID.randomUUID().toString(), null,
                "Cerveza", "Cervezas", true, "6000", null, null, false, 0L, 10L), 1);
        var second = service.save(null, new ProductCommands.Save(UUID.randomUUID().toString(), null,
                "Otra", "Cervezas", true, "7000", null, null, false, 0L, 10L), 1);
        var lines = java.util.List.of(new ProductCommands.SaleLine(first.id(), first.version(), new java.math.BigDecimal("2")),
                new ProductCommands.SaleLine(second.id(), second.version(), new java.math.BigDecimal("3")));
        for (String invalid : new String[]{"", "TARJETA"}) {
            assertThatThrownBy(() -> service.checkout(new ProductCommands.Checkout(UUID.randomUUID().toString(), lines, invalid, null, null, null), 1)).isInstanceOf(CatalogException.class);
            assertThatThrownBy(() -> service.saveAccount(new ProductCommands.SaveAccount(UUID.randomUUID().toString(), null, null, invalid, null, lines), 1)).isInstanceOf(CatalogException.class);
        }
        assertThatThrownBy(() -> service.checkout(new ProductCommands.Checkout(UUID.randomUUID().toString(), lines, null, null, null, null), 1)).isInstanceOf(CatalogException.class);
        assertThatThrownBy(() -> service.saveAccount(new ProductCommands.SaveAccount(UUID.randomUUID().toString(), null, null, "EFECTIVO", "a".repeat(81), lines), 1)).isInstanceOf(CatalogException.class);
        var account = service.saveAccount(new ProductCommands.SaveAccount(UUID.randomUUID().toString(), null, null, "EFECTIVO", "", lines), 1);
        assertThat(account.name()).isNull();
        var updated = service.saveAccount(new ProductCommands.SaveAccount(UUID.randomUUID().toString(), account.id(), account.version(), "EFECTIVO", null,
                java.util.List.of(new ProductCommands.SaleLine(first.id(), service.find(first.id()).version(), java.math.BigDecimal.ONE))), 1);
        assertThat(service.find(first.id()).quantityRemaining()).isEqualTo(9);
        assertThat(service.find(second.id()).quantityRemaining()).isEqualTo(10);
        assertThat(updated.lines()).hasSize(1);
        // Receipts written before payment methods were introduced remain readable.
        var mapper = tools.jackson.databind.json.JsonMapper.builder().build();
        String legacy = "{\"id\":\"legacy\",\"totalMinor\":0,\"lines\":[],\"occurredAt\":0}";
        assertThat(mapper.readValue(legacy, com.appbarpos.catalog.domain.SaleReceipt.class).paymentMethod()).isNull();
    }

    @Test
    void salesHistoryKeepsOriginalPricesAfterEditingAndDeletingProductsAndPaginates() throws Exception {
        var product = service.save(null, new ProductCommands.Save(UUID.randomUUID().toString(), null,
                "Nombre original", "Cervezas", true, "6000", null, null, false, 0L, 30L), 1);
        var first = service.checkout(new ProductCommands.Checkout(UUID.randomUUID().toString(), java.util.List.of(
                new ProductCommands.SaleLine(product.id(), product.version(), java.math.BigDecimal.ONE))), 1);
        var sold = service.find(product.id());
        var edited = service.save(product.id(), input(UUID.randomUUID().toString(), sold.version(), "Nombre nuevo", "7500", null, null, false), 1);
        for (int index = 0; index < 20; index++) {
            var current = service.find(edited.id());
            service.checkout(new ProductCommands.Checkout(UUID.randomUUID().toString(), java.util.List.of(
                    new ProductCommands.SaleLine(current.id(), current.version(), java.math.BigDecimal.ONE))), 1);
        }
        var page = service.sales(0);
        var next = service.sales(1);
        assertThat(page.sales()).hasSize(20);
        assertThat(page.hasNext()).isTrue();
        assertThat(next.sales()).hasSize(1);
        assertThat(next.hasNext()).isFalse();
        var all = java.util.stream.Stream.concat(page.sales().stream(), next.sales().stream()).toList();
        assertThat(all.stream().map(com.appbarpos.catalog.domain.SaleReceipt::id).distinct().count()).isEqualTo(21);
        var original = all.stream().filter(receipt -> receipt.id().equals(first.id())).findFirst().orElseThrow();
        assertThat(original.lines().getFirst().product().name()).isEqualTo("Nombre original");
        assertThat(original.lines().getFirst().unitPriceMinor()).isEqualTo(600000);
        assertThat(original.totalMinor()).isEqualTo(600000);
        assertThat(all.stream().filter(receipt -> !receipt.id().equals(first.id())).map(com.appbarpos.catalog.domain.SaleReceipt::totalMinor))
                .containsOnly(750000L);
        var current = service.find(product.id());
        service.delete(product.id(), new ProductCommands.Delete(UUID.randomUUID().toString(), current.version()), 1);
        assertThat(service.sales(0)).isEqualTo(page);
        assertThat(service.sales(1)).isEqualTo(next);
        assertThat(service.sales(2).sales()).isEmpty();
        assertThatThrownBy(() -> service.sales(-1)).isInstanceOf(CatalogException.class);
    }

    @Test
    void categoriesAreRequiredAndLiquorPresentationsAreValidated() throws Exception {
        for (String category : new String[]{"", "Licores", "Otra"}) {
            assertThatThrownBy(() -> service.save(null, new ProductCommands.Save(UUID.randomUUID().toString(), null,
                    "Producto", category, true, "6000", null, null, false), 1)).isInstanceOf(CatalogException.class);
        }
        for (String category : new String[]{"Rones", "Aguardientes"}) {
            assertThatThrownBy(() -> service.save(null, new ProductCommands.Save(UUID.randomUUID().toString(), null,
                    "Licor", category, true, "6000", null, null, false), 1)).isInstanceOf(CatalogException.class);
            for (String kind : new String[]{"MEDIA", "BOTELLA", "LITRO"}) {
                int ml = kind.equals("MEDIA") ? 375 : kind.equals("BOTELLA") ? 750 : 1000;
                var first = service.save(null, new ProductCommands.Save(UUID.randomUUID().toString(), null,
                        "Licor " + kind, category, true, "6000", null, null, false, 0L, 12L, kind, ml), 1);
                assertThat(service.find(first.id()).packageKind()).isEqualTo(kind);
                assertThat(service.find(first.id()).volumeMl()).isEqualTo(ml);
            }
            assertThatThrownBy(() -> service.save(null, new ProductCommands.Save(UUID.randomUUID().toString(), null,
                    "Licor", category, true, "6000", null, null, false, 0L, 1L, "OTRA", 750), 1)).isInstanceOf(CatalogException.class);
            assertThatThrownBy(() -> service.save(null, new ProductCommands.Save(UUID.randomUUID().toString(), null,
                    "Licor", category, true, "6000", null, null, false, 0L, 1L, "BOTELLA", 0), 1)).isInstanceOf(CatalogException.class);
        }
        var normalized = service.save(null, new ProductCommands.Save(UUID.randomUUID().toString(), null,
                "Cóctel", "  cocteles  ", true, "12000", null, null, false), 1);
        assertThat(normalized.category()).isEqualTo("Cócteles");
    }

    @Test
    void checkoutAndRestockUpdateInventoryOnceAndRollbackTogether() throws Exception {
        var first = service.save(null, new ProductCommands.Save(UUID.randomUUID().toString(), null,
                "Cerveza", "Cervezas", true, "6000", null, null, false, 0L, 12L), 1);
        var second = service.save(null, new ProductCommands.Save(UUID.randomUUID().toString(), null,
                "Mezcla", "Bebidas preparadas mezclas", true, "10000", null, null, false, 0L, 5L), 1);
        var restock = new ProductCommands.Restock(UUID.randomUUID().toString(), first.version(), new java.math.BigDecimal("6"));
        var stocked = service.restock(first.id(), restock, 1);
        assertThat(stocked.quantityRemaining()).isEqualTo(18);
        assertThat(stocked.quantitySold()).isZero();
        assertThat(service.restock(first.id(), restock, 1)).isEqualTo(stocked);
        var checkout = new ProductCommands.Checkout(UUID.randomUUID().toString(), java.util.List.of(
                new ProductCommands.SaleLine(first.id(), stocked.version(), new java.math.BigDecimal("3")),
                new ProductCommands.SaleLine(second.id(), second.version(), new java.math.BigDecimal("2"))));
        var receipt = service.checkout(checkout, 1);
        assertThat(receipt.totalMinor()).isEqualTo(3_800_000);
        assertThat(service.checkout(checkout, 1)).isEqualTo(receipt);
        var soldFirst = service.find(first.id());
        var soldSecond = service.find(second.id());
        assertThat(soldFirst.quantityRemaining()).isEqualTo(15);
        assertThat(soldFirst.quantitySold()).isEqualTo(3);
        assertThat(soldSecond.quantityRemaining()).isEqualTo(3);
        assertThat(soldSecond.quantitySold()).isEqualTo(2);
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM inventory_sale", Integer.class)).isEqualTo(1);
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM inventory_movement", Integer.class)).isEqualTo(3);
        assertThatThrownBy(() -> service.restock(first.id(), new ProductCommands.Restock(UUID.randomUUID().toString(), 1, java.math.BigDecimal.ONE), 1))
                .isInstanceOfSatisfying(CatalogException.class, error -> assertThat(error.code()).isEqualTo("VERSION_CONFLICT"));
        var oversold = new ProductCommands.Checkout(UUID.randomUUID().toString(), java.util.List.of(
                new ProductCommands.SaleLine(first.id(), soldFirst.version(), java.math.BigDecimal.ONE),
                new ProductCommands.SaleLine(second.id(), soldSecond.version(), new java.math.BigDecimal("4"))));
        assertThatThrownBy(() -> service.checkout(oversold, 1)).isInstanceOf(CatalogException.class);
        jdbc.execute("CREATE TRIGGER fail_second_sale_movement BEFORE INSERT ON inventory_movement WHEN NEW.kind = 'SALE' AND NEW.product_id = '" + second.id() + "' BEGIN SELECT RAISE(ABORT, 'controlled failure'); END");
        var failed = new ProductCommands.Checkout(UUID.randomUUID().toString(), java.util.List.of(
                new ProductCommands.SaleLine(first.id(), soldFirst.version(), java.math.BigDecimal.ONE),
                new ProductCommands.SaleLine(second.id(), soldSecond.version(), java.math.BigDecimal.ONE)));
        assertThatThrownBy(() -> service.checkout(failed, 1)).isInstanceOf(org.springframework.dao.DataAccessException.class);
        assertThat(service.find(first.id())).isEqualTo(soldFirst);
        assertThat(service.find(second.id())).isEqualTo(soldSecond);
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM inventory_sale", Integer.class)).isEqualTo(1);
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM inventory_movement", Integer.class)).isEqualTo(3);
        assertThatThrownBy(() -> jdbc.update("DELETE FROM inventory_sale")).isInstanceOf(org.springframework.dao.DataAccessException.class);
        assertThatThrownBy(() -> jdbc.update("DELETE FROM inventory_movement")).isInstanceOf(org.springframework.dao.DataAccessException.class);
    }

    @Test
    void inventoryOperationsRejectInvalidAmountsDuplicateLinesAndDeletedProducts() throws Exception {
        var first = service.save(null, new ProductCommands.Save(UUID.randomUUID().toString(), null,
                "Cerveza", "Cervezas", true, "6000", null, null, false, 0L, 12L), 1);
        for (String amount : new String[]{"0", "-1", "1.5", "9007199254740992"}) {
            var quantity = new java.math.BigDecimal(amount);
            assertThatThrownBy(() -> service.restock(first.id(), new ProductCommands.Restock(UUID.randomUUID().toString(), 1, quantity), 1))
                    .isInstanceOf(CatalogException.class);
            assertThatThrownBy(() -> service.checkout(new ProductCommands.Checkout(UUID.randomUUID().toString(), java.util.List.of(
                    new ProductCommands.SaleLine(first.id(), 1, quantity))), 1)).isInstanceOf(CatalogException.class);
        }
        var line = new ProductCommands.SaleLine(first.id(), 1, java.math.BigDecimal.ONE);
        assertThatThrownBy(() -> service.checkout(new ProductCommands.Checkout(UUID.randomUUID().toString(), java.util.List.of(line, line)), 1))
                .isInstanceOf(CatalogException.class);
        service.delete(first.id(), new ProductCommands.Delete(UUID.randomUUID().toString(), 1), 1);
        assertThatThrownBy(() -> service.restock(first.id(), new ProductCommands.Restock(UUID.randomUUID().toString(), 1, java.math.BigDecimal.ONE), 1))
                .isInstanceOf(CatalogException.class);
        assertThatThrownBy(() -> service.checkout(new ProductCommands.Checkout(UUID.randomUUID().toString(), java.util.List.of(line)), 1))
                .isInstanceOf(CatalogException.class);
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM inventory_sale", Integer.class)).isZero();
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM inventory_movement", Integer.class)).isZero();
    }

    @Test
    void deletionIsAuditedRetryableAndRejectsStaleEdits() throws Exception {
        var first = service.save(null, input(UUID.randomUUID().toString(), null, "Eliminar", "6000", null, null, false), 1);
        var stale = new ProductCommands.Delete(UUID.randomUUID().toString(), 0);
        assertThatThrownBy(() -> service.delete(first.id(), stale, 1))
                .isInstanceOfSatisfying(CatalogException.class, error -> assertThat(error.code()).isEqualTo("VERSION_CONFLICT"));
        var command = new ProductCommands.Delete(UUID.randomUUID().toString(), first.version());
        // A failed history write must leave the product available.
        assertThatThrownBy(() -> service.delete(first.id(), command, 999))
                .isInstanceOf(org.springframework.dao.DataAccessException.class);
        assertThat(service.find(first.id())).isEqualTo(first);
        assertThat(service.delete(first.id(), command, 1)).isEqualTo(first);
        assertThat(service.delete(first.id(), command, 1)).isEqualTo(first);
        assertThat(service.list()).isEmpty();
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM product", Integer.class)).isEqualTo(1);
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM product_deletion", Integer.class)).isEqualTo(1);
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM product_operation", Integer.class)).isEqualTo(1);
        assertThatThrownBy(() -> service.find(first.id())).isInstanceOf(CatalogException.class);
        assertThatThrownBy(() -> service.save(first.id(), input(UUID.randomUUID().toString(), 1, "Volver", "1", null, null, false), 1))
                .isInstanceOf(CatalogException.class);
        assertThatThrownBy(() -> service.status(first.id(), new ProductCommands.Status(UUID.randomUUID().toString(), 1, true), 1))
                .isInstanceOf(CatalogException.class);
        assertThatThrownBy(() -> service.delete(first.id(), new ProductCommands.Delete(UUID.randomUUID().toString(), 1), 1))
                .isInstanceOf(CatalogException.class);
        assertThatThrownBy(() -> service.save(null, input(command.operationId(), null, "Reutilizar", "1", null, null, false), 1))
                .isInstanceOfSatisfying(CatalogException.class, error -> assertThat(error.code()).isEqualTo("OPERATION_CONFLICT"));
        assertThatThrownBy(() -> jdbc.update("DELETE FROM product_deletion")).isInstanceOf(org.springframework.dao.DataAccessException.class);
    }

    @Test
    void inventoryPersistsAndRetriesAndStaleEditsDoNotChangeQuantities() throws Exception {
        var command = new ProductCommands.Save(UUID.randomUUID().toString(), null, "Cerveza", "Cervezas",
                true, "6000", null, null, false, 3L, 24L);
        var first = service.save(null, command, 1);
        assertThat(service.find(first.id()).quantitySold()).isEqualTo(3);
        assertThat(service.find(first.id()).quantityRemaining()).isEqualTo(24);
        assertThat(service.save(null, command, 1)).isEqualTo(first);
        var edit = new ProductCommands.Save(UUID.randomUUID().toString(), 1, "Cerveza", "Cervezas",
                true, "6500", null, null, false, 5L, 22L);
        var updated = service.save(first.id(), edit, 1);
        assertThat(service.list().getFirst()).isEqualTo(updated);
        assertThatThrownBy(() -> service.save(first.id(), new ProductCommands.Save(UUID.randomUUID().toString(), 1,
                "Obsoleto", "Cervezas", true, "1", null, null, false, 0L, 0L), 1))
                .isInstanceOf(CatalogException.class);
        assertThat(service.find(first.id()).quantityRemaining()).isEqualTo(22);
        var status = service.status(first.id(), new ProductCommands.Status(UUID.randomUUID().toString(), 2, false), 1);
        assertThat(status.quantitySold()).isEqualTo(5);
        assertThat(status.quantityRemaining()).isEqualTo(22);
        // Older clients can edit prices without erasing inventory.
        var legacy = service.save(first.id(), input(UUID.randomUUID().toString(), 3, "Cerveza", "7000", null, null, false), 1);
        assertThat(legacy.quantitySold()).isEqualTo(5);
        assertThat(legacy.quantityRemaining()).isEqualTo(22);
        jdbc.execute("CREATE TRIGGER fail_inventory_audit BEFORE INSERT ON product_operation BEGIN SELECT RAISE(ABORT, 'controlled failure'); END");
        assertThatThrownBy(() -> service.save(first.id(), new ProductCommands.Save(UUID.randomUUID().toString(), 4,
                "Cerveza", "Cervezas", true, "7000", null, null, false, 6L, 21L), 1))
                .isInstanceOf(org.springframework.dao.DataAccessException.class);
        assertThat(service.find(first.id())).isEqualTo(legacy);
    }

    @Test
    void inventoryRejectsNegativeAndUnsafeQuantities() {
        for (long invalid : new long[]{-1, 9_007_199_254_740_992L}) {
            assertThatThrownBy(() -> service.save(null, new ProductCommands.Save(UUID.randomUUID().toString(), null,
                    "Cerveza", "Cervezas", true, "6000", null, null, false, invalid, 0L), 1))
                    .isInstanceOf(CatalogException.class);
            assertThatThrownBy(() -> service.save(null, new ProductCommands.Save(UUID.randomUUID().toString(), null,
                    "Cerveza", "Cervezas", true, "6000", null, null, false, 0L, invalid), 1))
                    .isInstanceOf(CatalogException.class);
        }
        assertThat(service.list()).isEmpty();
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
