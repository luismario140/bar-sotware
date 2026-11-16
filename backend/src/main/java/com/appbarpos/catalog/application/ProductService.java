package com.appbarpos.catalog.application;

import com.appbarpos.catalog.api.ProductCommands;
import com.appbarpos.catalog.domain.Product;
import com.appbarpos.catalog.domain.CatalogCategories;
import com.appbarpos.catalog.domain.SaleReceipt;
import com.appbarpos.catalog.domain.SalesHistory;
import com.appbarpos.catalog.infrastructure.ProductImages;
import com.appbarpos.catalog.repository.ProductRepository;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.Clock;
import java.util.HexFormat;
import java.util.List;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicReference;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
import tools.jackson.databind.json.JsonMapper;

@Service
public class ProductService {
    private final ProductRepository repository;
    private final ProductImages images;
    private final TransactionTemplate transaction;
    private final Clock clock;
    private final JsonMapper json = JsonMapper.builder().build();

    public ProductService(ProductRepository repository, ProductImages images, PlatformTransactionManager manager, Clock clock) {
        this.repository = repository; this.images = images; this.clock = clock;
        transaction = new TransactionTemplate(manager);
    }

    public List<Product> list() { return repository.list(); }
    public SalesHistory sales(int page) {
        if (page < 0 || page > 1_000_000) throw CatalogException.invalid("La página de ventas no es válida.");
        var results = repository.sales(page);
        return new SalesHistory(results.stream().limit(20).map(value -> json.readValue(value, SaleReceipt.class)).toList(), page, results.size() > 20);
    }
    public Product find(String id) { uuid(id); return repository.find(id).orElseThrow(CatalogException::missing); }
    public byte[] image(String id) throws java.io.IOException { return images.read(find(id).imageId()); }

    public synchronized Product save(String id, ProductCommands.Save input, long administrator) throws Exception {
        uuid(input.operationId());
        String name = text(input.name(), 120, false), category = CatalogCategories.require(input.category());
        String packageKind = null;
        Integer volumeMl = null;
        if (CatalogCategories.requiresVolume(category)) {
            if (input.packageKind() == null || !List.of("MEDIA", "BOTELLA", "LITRO").contains(input.packageKind()) ||
                    input.volumeMl() == null || input.volumeMl() < 1 || input.volumeMl() > 10000) {
                throw CatalogException.invalid("Selecciona media, botella o litro e indica su contenido en ml (1 a 10000).");
            }
            packageKind = input.packageKind(); volumeMl = input.volumeMl();
        }
        final String selectedPackage = packageKind;
        final Integer selectedVolume = volumeMl;
        Long unit = price(input.unitPrice()), shot = price(input.shotPrice());
        if (unit == null && shot == null) throw CatalogException.invalid("Configura al menos un precio por unidad o shot.");
        if (input.active() == null) throw CatalogException.invalid("Selecciona el estado del producto.");
        if (input.imageBase64() != null && input.removeImage()) throw CatalogException.invalid("No se puede agregar y quitar la imagen a la vez.");
        if (id != null) uuid(id);
        String hash = hash(json.writeValueAsString(List.of("SAVE", id == null ? "" : id, json.writeValueAsString(input))));
        var writtenImage = new AtomicReference<String>();
        try {
            return transaction.execute(status -> {
                Product previousResult = replay(input.operationId(), hash);
                if (previousResult != null) return previousResult;
                Product before = id == null ? null : find(id);
                version(before, input.expectedVersion());
                String image = before == null ? null : before.imageId();
                if (input.removeImage()) image = null;
                if (input.imageBase64() != null) {
                    try { image = images.store(images.normalize(input.imageBase64())); }
                    catch (java.io.IOException exception) { throw new java.io.UncheckedIOException(exception); }
                    writtenImage.set(image);
                }
                Product after = new Product(id == null ? UUID.randomUUID().toString() : id, name, category, input.active(),
                        before == null ? 1 : before.version() + 1, unit, shot, image,
                        quantity(input.quantitySold(), before == null ? 0 : before.quantitySold()),
                        quantity(input.quantityRemaining(), before == null ? 0 : before.quantityRemaining()), selectedPackage, selectedVolume);
                repository.save(after, before == null, clock.millis());
                repository.audit(input.operationId(), after.id(), administrator, before == null ? "CREATE" : "UPDATE", hash,
                        before == null ? null : json.writeValueAsString(before), json.writeValueAsString(after), clock.millis());
                return after;
            });
        } catch (Exception failure) {
            if (writtenImage.get() != null) {
                try {
                    // Si el resultado del commit es incierto, conservar el archivo es más seguro.
                    if (!repository.imageReferenced(writtenImage.get())) images.discard(writtenImage.get());
                } catch (Exception cleanup) { failure.addSuppressed(cleanup); }
            }
            throw failure;
        }
    }

    public synchronized Product status(String id, ProductCommands.Status input, long administrator) {
        uuid(id); uuid(input.operationId());
        if (input.active() == null) throw CatalogException.invalid("Selecciona el estado del producto.");
        String hash = hash(json.writeValueAsString(List.of("STATUS", id, input)));
        return transaction.execute(status -> {
            Product previousResult = replay(input.operationId(), hash);
            if (previousResult != null) return previousResult;
            Product before = find(id);
            version(before, input.expectedVersion());
            Product after = new Product(id, before.name(), before.category(), input.active(), before.version() + 1,
                    before.unitPriceMinor(), before.shotPriceMinor(), before.imageId(), before.quantitySold(), before.quantityRemaining(), before.packageKind(), before.volumeMl());
            repository.save(after, false, clock.millis());
            repository.audit(input.operationId(), id, administrator, "STATUS", hash, json.writeValueAsString(before),
                    json.writeValueAsString(after), clock.millis());
            return after;
        });
    }

    public synchronized Product delete(String id, ProductCommands.Delete input, long administrator) {
        uuid(id); uuid(input.operationId());
        String hash = hash(json.writeValueAsString(List.of("DELETE", id, input)));
        return transaction.execute(status -> {
            Product previousResult = replay(input.operationId(), hash);
            if (previousResult != null) return previousResult;
            Product before = find(id);
            version(before, input.expectedVersion());
            repository.delete(input.operationId(), id, administrator, hash, json.writeValueAsString(before), clock.millis());
            return before;
        });
    }

    public synchronized Product restock(String id, ProductCommands.Restock input, long administrator) {
        uuid(id); uuid(input.operationId());
        long amount = positiveQuantity(input.quantity());
        String hash = hash(json.writeValueAsString(List.of("RESTOCK", id, input)));
        return transaction.execute(status -> {
            Product previousResult = replay(input.operationId(), hash);
            if (previousResult != null) return previousResult;
            Product before = find(id);
            version(before, input.expectedVersion());
            Product after = withStock(before, before.quantitySold(), addQuantity(before.quantityRemaining(), amount));
            repository.save(after, false, clock.millis());
            repository.movement(input.operationId(), id, null, administrator, "RESTOCK", amount, hash,
                    json.writeValueAsString(before), json.writeValueAsString(after), clock.millis());
            return after;
        });
    }

    public synchronized SaleReceipt checkout(ProductCommands.Checkout input, long administrator) {
        uuid(input.operationId());
        if (input.lines() == null || input.lines().isEmpty() || input.lines().size() > 100) {
            throw CatalogException.invalid("Agrega entre 1 y 100 productos a la venta.");
        }
        String hash = hash(json.writeValueAsString(List.of("CHECKOUT", input)));
        return transaction.execute(status -> {
            SaleReceipt previousResult = replay(input.operationId(), hash, SaleReceipt.class);
            if (previousResult != null) return previousResult;
            var ids = new HashSet<String>();
            var beforeProducts = new ArrayList<Product>();
            var lines = new ArrayList<SaleReceipt.Line>();
            long total = 0;
            for (var item : input.lines()) {
                if (item == null) throw CatalogException.invalid("Revisa los productos de la venta.");
                uuid(item.productId());
                if (!ids.add(item.productId())) throw CatalogException.invalid("Cada producto debe aparecer una sola vez en la venta.");
                long amount = positiveQuantity(item.quantity());
                Product before = find(item.productId());
                version(before, item.expectedVersion());
                String category = CatalogCategories.require(before.category());
                if (CatalogCategories.requiresVolume(category) && (before.packageKind() == null || before.volumeMl() == null)) {
                    throw CatalogException.invalid("Configura la presentación de " + before.name() + " antes de venderlo.");
                }
                if (before.unitPriceMinor() == null) throw CatalogException.invalid("Configura el precio por unidad de " + before.name() + " antes de venderlo.");
                if (before.quantityRemaining() < amount) throw CatalogException.invalid("No hay existencias suficientes de " + before.name() + ".");
                long subtotal;
                try { subtotal = Math.multiplyExact(before.unitPriceMinor(), amount); total = Math.addExact(total, subtotal); }
                catch (ArithmeticException overflow) { throw CatalogException.invalid("El total de la venta supera el rango permitido."); }
                if (total > 9_007_199_254_740_991L) throw CatalogException.invalid("El total de la venta supera el rango permitido.");
                Product after = withStock(before, addQuantity(before.quantitySold(), amount), before.quantityRemaining() - amount);
                beforeProducts.add(before);
                lines.add(new SaleReceipt.Line(after, amount, before.unitPriceMinor(), subtotal));
            }
            long now = clock.millis();
            var receipt = new SaleReceipt(input.operationId(), total, List.copyOf(lines), now);
            repository.sale(input.operationId(), administrator, hash, total, json.writeValueAsString(receipt), now);
            for (int index = 0; index < lines.size(); index++) {
                var line = lines.get(index);
                repository.save(line.product(), false, now);
                repository.movement(input.operationId(), line.product().id(), receipt.id(), administrator, "SALE", line.quantity(), hash,
                        json.writeValueAsString(beforeProducts.get(index)), json.writeValueAsString(line.product()), now);
            }
            return receipt;
        });
    }

    private Product withStock(Product before, long sold, long remaining) {
        return new Product(before.id(), before.name(), before.category(), before.active(), before.version() + 1,
                before.unitPriceMinor(), before.shotPriceMinor(), before.imageId(), sold, remaining, before.packageKind(), before.volumeMl());
    }

    private long positiveQuantity(BigDecimal value) {
        try {
            long amount = value == null ? 0 : value.longValueExact();
            if (amount < 1 || amount > 9_007_199_254_740_991L) throw new ArithmeticException();
            return amount;
        } catch (ArithmeticException invalid) { throw CatalogException.invalid("Indica una cantidad entera mayor que cero dentro del rango permitido."); }
    }

    private long addQuantity(long current, long amount) {
        if (current > 9_007_199_254_740_991L - amount) throw CatalogException.invalid("La cantidad supera el rango permitido.");
        return current + amount;
    }

    private Product replay(String id, String hash) { return replay(id, hash, Product.class); }

    private <T> T replay(String id, String hash, Class<T> type) {
        var operation = repository.operation(id);
        if (operation.isEmpty()) return null;
        if (!operation.get().hash().equals(hash)) throw new CatalogException(HttpStatus.CONFLICT, "OPERATION_CONFLICT", "Este guardado ya se utilizó con otros datos. Vuelve a abrir el formulario.");
        return json.readValue(operation.get().result(), type);
    }

    private void version(Product before, Integer expected) {
        if (before == null ? expected != null : expected == null || before.version() != expected) {
            throw new CatalogException(HttpStatus.CONFLICT, "VERSION_CONFLICT", "El producto cambió en otra ventana. Actualiza el catálogo antes de editarlo.");
        }
    }

    private String text(String value, int limit, boolean optional) {
        String normalized = value == null ? "" : value.strip();
        if ((!optional && normalized.isEmpty()) || normalized.length() > limit || normalized.codePoints().anyMatch(Character::isISOControl)) {
            throw CatalogException.invalid("Revisa el nombre (máximo 120 caracteres) y la categoría (máximo 60).");
        }
        return normalized;
    }

    private long quantity(Long value, long previous) {
        if (value == null) return previous;
        if (value < 0 || value > 9_007_199_254_740_991L) {
            throw CatalogException.invalid("Las cantidades deben ser números enteros no negativos dentro del rango permitido.");
        }
        return value;
    }

    private Long price(String value) {
        if (value == null || value.isBlank()) return null;
        try {
            String normalized = value.strip().replace(',', '.');
            if (normalized.length() > 24) throw new IllegalArgumentException();
            if (!normalized.matches("[0-9]+(\\.[0-9]{1,2})?")) throw new IllegalArgumentException();
            long minor = new BigDecimal(normalized).setScale(2, RoundingMode.UNNECESSARY).movePointRight(2).longValueExact();
            if (minor > 9_007_199_254_740_991L) throw new IllegalArgumentException();
            return minor;
        } catch (IllegalArgumentException | ArithmeticException exception) {
            throw CatalogException.invalid("Los precios deben ser importes no negativos con hasta dos decimales, sin separadores de miles.");
        }
    }

    private void uuid(String value) {
        if (value == null || !value.matches("[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}")) throw CatalogException.invalid("Identificador de operación o producto inválido.");
    }

    private String hash(String value) {
        try { return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(value.getBytes(StandardCharsets.UTF_8))); }
        catch (java.security.NoSuchAlgorithmException exception) { throw new IllegalStateException(exception); }
    }
}
