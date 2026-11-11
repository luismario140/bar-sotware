package com.appbarpos.catalog.application;

import com.appbarpos.catalog.api.ProductCommands;
import com.appbarpos.catalog.domain.Product;
import com.appbarpos.catalog.infrastructure.ProductImages;
import com.appbarpos.catalog.repository.ProductRepository;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.Clock;
import java.util.HexFormat;
import java.util.List;
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
    public Product find(String id) { uuid(id); return repository.find(id).orElseThrow(CatalogException::missing); }
    public byte[] image(String id) throws java.io.IOException { return images.read(find(id).imageId()); }

    public synchronized Product save(String id, ProductCommands.Save input, long administrator) throws Exception {
        uuid(input.operationId());
        String name = text(input.name(), 120, false), category = text(input.category(), 60, true);
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
                        before == null ? 1 : before.version() + 1, unit, shot, image);
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
                    before.unitPriceMinor(), before.shotPriceMinor(), before.imageId());
            repository.save(after, false, clock.millis());
            repository.audit(input.operationId(), id, administrator, "STATUS", hash, json.writeValueAsString(before),
                    json.writeValueAsString(after), clock.millis());
            return after;
        });
    }

    private Product replay(String id, String hash) {
        var operation = repository.operation(id);
        if (operation.isEmpty()) return null;
        if (!operation.get().hash().equals(hash)) throw new CatalogException(HttpStatus.CONFLICT, "OPERATION_CONFLICT", "Este guardado ya se utilizó con otros datos. Vuelve a abrir el formulario.");
        return json.readValue(operation.get().result(), Product.class);
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
