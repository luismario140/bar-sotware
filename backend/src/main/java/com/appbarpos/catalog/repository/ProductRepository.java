package com.appbarpos.catalog.repository;

import com.appbarpos.catalog.domain.Product;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.context.annotation.DependsOn;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

@Repository
@DependsOn("flyway")
public class ProductRepository {
    private final JdbcTemplate jdbc;
    private static final String SELECT = "SELECT p.*, " +
            "(SELECT price_minor FROM sale_presentation WHERE product_id = p.id AND kind = 'UNIT' AND active = 1) unit_price, " +
            "(SELECT price_minor FROM sale_presentation WHERE product_id = p.id AND kind = 'SHOT' AND active = 1) shot_price FROM product p";

    public ProductRepository(JdbcTemplate jdbc) { this.jdbc = jdbc; }

    private Product map(java.sql.ResultSet rs, int row) throws java.sql.SQLException {
        return new Product(rs.getString("id"), rs.getString("name"), rs.getString("category"), rs.getBoolean("active"),
                rs.getInt("version"), nullableLong(rs, "unit_price"),
                nullableLong(rs, "shot_price"), rs.getString("image_id"),
                rs.getLong("quantity_sold"), rs.getLong("quantity_remaining"), rs.getString("package_kind"),
                rs.getObject("volume_ml") == null ? null : rs.getInt("volume_ml"));
    }

    private Long nullableLong(java.sql.ResultSet rs, String column) throws java.sql.SQLException {
        long value = rs.getLong(column);
        return rs.wasNull() ? null : value;
    }

    private static final String VISIBLE = " NOT EXISTS (SELECT 1 FROM product_deletion d WHERE d.product_id = p.id)";
    public List<Product> list() { return jdbc.query(SELECT + " WHERE" + VISIBLE + " ORDER BY p.name COLLATE NOCASE, p.id", this::map); }
    public Optional<Product> find(String id) { return jdbc.query(SELECT + " WHERE p.id = ? AND" + VISIBLE, this::map, id).stream().findFirst(); }

    public void delete(String operation, String product, long administrator, String hash, String result, long now) {
        jdbc.update("INSERT INTO product_deletion (operation_id, product_id, administrator_id, request_hash, result_json, occurred_at) VALUES (?, ?, ?, ?, ?, ?)",
                operation, product, administrator, hash, result, now);
    }

    public void save(Product product, boolean create, long now) {
        if (create) {
            jdbc.update("INSERT INTO product (id, name, category, active, image_id, version, created_at, updated_at, quantity_sold, quantity_remaining, package_kind, volume_ml) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                    product.id(), product.name(), product.category(), product.active(), product.imageId(), product.version(), now, now,
                    product.quantitySold(), product.quantityRemaining(), product.packageKind(), product.volumeMl());
        } else {
            int changed = jdbc.update("UPDATE product SET name = ?, category = ?, active = ?, image_id = ?, version = ?, updated_at = ?, quantity_sold = ?, quantity_remaining = ?, package_kind = ?, volume_ml = ? WHERE id = ? AND version = ?",
                    product.name(), product.category(), product.active(), product.imageId(), product.version(), now,
                    product.quantitySold(), product.quantityRemaining(), product.packageKind(), product.volumeMl(), product.id(), product.version() - 1);
            if (changed != 1) throw new com.appbarpos.catalog.application.CatalogException(org.springframework.http.HttpStatus.CONFLICT,
                    "VERSION_CONFLICT", "El producto cambió. Actualiza el catálogo antes de editarlo.");
        }
        presentation(product.id(), "UNIT", product.unitPriceMinor());
        presentation(product.id(), "SHOT", product.shotPriceMinor());
    }

    private void presentation(String productId, String kind, Long price) {
        if (price == null) {
            jdbc.update("UPDATE sale_presentation SET active = 0 WHERE product_id = ? AND kind = ?", productId, kind);
        } else {
            jdbc.update("INSERT INTO sale_presentation (id, product_id, kind, price_minor, currency, active) VALUES (?, ?, ?, ?, 'COP', 1) " +
                            "ON CONFLICT(product_id, kind) DO UPDATE SET price_minor = excluded.price_minor, active = 1",
                    UUID.randomUUID().toString(), productId, kind, price);
        }
    }

    public Optional<Operation> operation(String id) {
        return jdbc.query("SELECT request_hash, result_json FROM product_operation WHERE id = ? UNION ALL SELECT request_hash, result_json FROM product_deletion WHERE operation_id = ? " +
                        "UNION ALL SELECT request_hash, result_json FROM inventory_movement WHERE operation_id = ? AND kind = 'RESTOCK' " +
                        "UNION ALL SELECT request_hash, result_json FROM inventory_sale WHERE operation_id = ? " +
                        "UNION ALL SELECT request_hash, result_json FROM account_operation WHERE operation_id = ? " +
                        "UNION ALL SELECT request_hash, result_json FROM account_cancellation WHERE operation_id = ?",
                (rs, row) -> new Operation(rs.getString(1), rs.getString(2)), id, id, id, id, id, id).stream().findFirst();
    }

    public void sale(String operation, long administrator, String hash, long total, String result, long now) {
        jdbc.update("INSERT INTO inventory_sale VALUES (?, ?, ?, ?, ?, ?)", operation, administrator, hash, total, result, now);
    }

    public List<String> sales(int page) {
        return jdbc.query("SELECT result_json FROM inventory_sale ORDER BY occurred_at DESC, operation_id DESC LIMIT 21 OFFSET ?",
                (rs, row) -> rs.getString(1), page * 20);
    }

    public List<String> accounts() {
        return jdbc.query("SELECT result_json FROM customer_account WHERE status = 'OPEN' ORDER BY updated_at DESC, id", (rs, row) -> rs.getString(1));
    }

    public Optional<String> account(String id) {
        return jdbc.query("SELECT result_json FROM customer_account WHERE id = ? AND status = 'OPEN'", (rs, row) -> rs.getString(1), id).stream().findFirst();
    }

    public void account(com.appbarpos.catalog.domain.OpenAccount account, boolean create, String operation, long administrator, String hash, String result, long now) {
        if (create) jdbc.update("INSERT INTO customer_account VALUES (?, ?, 'OPEN', ?, ?, ?, NULL)", account.id(), account.version(), result, account.createdAt(), now);
        else {
            int changed = jdbc.update("UPDATE customer_account SET version = ?, result_json = ?, updated_at = ? WHERE id = ? AND version = ? AND status = 'OPEN'", account.version(), result, now, account.id(), account.version() - 1);
            if (changed != 1) throw com.appbarpos.catalog.application.CatalogException.invalid("La cuenta cambió. Vuelve a abrirla.");
        }
        jdbc.update("INSERT INTO account_operation VALUES (?, ?, ?, ?, ?, ?)", operation, account.id(), administrator, hash, result, now);
    }

    public void closeAccount(String id, int version, String sale, long now) {
        int changed = jdbc.update("UPDATE customer_account SET status = 'CLOSED', version = version + 1, updated_at = ?, closed_sale_id = ? WHERE id = ? AND version = ? AND status = 'OPEN'", now, sale, id, version);
        if (changed != 1) throw com.appbarpos.catalog.application.CatalogException.invalid("La cuenta cambió. Vuelve a abrirla.");
    }

    public List<String> cancellations() {
        return jdbc.query("SELECT result_json FROM account_cancellation ORDER BY occurred_at DESC, operation_id DESC LIMIT 20", (rs, row) -> rs.getString(1));
    }

    public void cancelAccount(String id, int version, String operation, long administrator, String hash, String result, long now) {
        closeAccount(id, version, null, now);
        jdbc.update("INSERT INTO account_cancellation VALUES (?, ?, ?, ?, ?, ?)", operation, id, administrator, hash, result, now);
    }

    public void movement(String operation, String product, String sale, long administrator, String kind, long quantity,
                         String hash, String before, String after, long now) {
        jdbc.update("INSERT INTO inventory_movement VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                UUID.randomUUID().toString(), operation, product, sale, administrator, kind, quantity, hash, before, after, now);
    }

    public boolean imageReferenced(String id) {
        return jdbc.queryForObject("SELECT COUNT(*) FROM product WHERE image_id = ?", Integer.class, id) > 0;
    }

    public void audit(String id, String productId, long admin, String action, String hash, String before, String after, long now) {
        jdbc.update("INSERT INTO product_operation VALUES (?, ?, ?, ?, ?, ?, ?, ?)", id, productId, admin, action, hash, before, after, now);
    }

    public record Operation(String hash, String result) { }
}
