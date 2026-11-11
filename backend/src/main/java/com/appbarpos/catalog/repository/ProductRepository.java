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
                nullableLong(rs, "shot_price"), rs.getString("image_id"));
    }

    private Long nullableLong(java.sql.ResultSet rs, String column) throws java.sql.SQLException {
        long value = rs.getLong(column);
        return rs.wasNull() ? null : value;
    }

    public List<Product> list() { return jdbc.query(SELECT + " ORDER BY p.name COLLATE NOCASE, p.id", this::map); }
    public Optional<Product> find(String id) { return jdbc.query(SELECT + " WHERE p.id = ?", this::map, id).stream().findFirst(); }

    public void save(Product product, boolean create, long now) {
        if (create) {
            jdbc.update("INSERT INTO product (id, name, category, active, image_id, version, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
                    product.id(), product.name(), product.category(), product.active(), product.imageId(), product.version(), now, now);
        } else {
            int changed = jdbc.update("UPDATE product SET name = ?, category = ?, active = ?, image_id = ?, version = ?, updated_at = ? WHERE id = ? AND version = ?",
                    product.name(), product.category(), product.active(), product.imageId(), product.version(), now, product.id(), product.version() - 1);
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
        return jdbc.query("SELECT request_hash, result_json FROM product_operation WHERE id = ?",
                (rs, row) -> new Operation(rs.getString(1), rs.getString(2)), id).stream().findFirst();
    }

    public boolean imageReferenced(String id) {
        return jdbc.queryForObject("SELECT COUNT(*) FROM product WHERE image_id = ?", Integer.class, id) > 0;
    }

    public void audit(String id, String productId, long admin, String action, String hash, String before, String after, long now) {
        jdbc.update("INSERT INTO product_operation VALUES (?, ?, ?, ?, ?, ?, ?, ?)", id, productId, admin, action, hash, before, after, now);
    }

    public record Operation(String hash, String result) { }
}
