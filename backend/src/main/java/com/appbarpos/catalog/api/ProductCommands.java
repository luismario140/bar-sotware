package com.appbarpos.catalog.api;

public final class ProductCommands {
    private ProductCommands() { }

    public record Save(String operationId, Integer expectedVersion, String name, String category,
                       Boolean active, String unitPrice, String shotPrice, String imageBase64, boolean removeImage,
                       Long quantitySold, Long quantityRemaining, String packageKind, Integer volumeMl) {
        public Save(String operationId, Integer expectedVersion, String name, String category,
                    Boolean active, String unitPrice, String shotPrice, String imageBase64, boolean removeImage,
                    Long quantitySold, Long quantityRemaining) {
            this(operationId, expectedVersion, name, category, active, unitPrice, shotPrice, imageBase64, removeImage,
                    quantitySold, quantityRemaining, null, null);
        }
        public Save(String operationId, Integer expectedVersion, String name, String category,
                    Boolean active, String unitPrice, String shotPrice, String imageBase64, boolean removeImage) {
            this(operationId, expectedVersion, name, category, active, unitPrice, shotPrice, imageBase64, removeImage, null, null, null, null);
        }
        @Override public String toString() { return "ProductSave[image redacted]"; }
    }
    public record Status(String operationId, Integer expectedVersion, Boolean active) { }
    public record Delete(String operationId, Integer expectedVersion) { }
    public record Restock(String operationId, Integer expectedVersion, java.math.BigDecimal quantity) { }
    public record SaleLine(String productId, Integer expectedVersion, java.math.BigDecimal quantity) { }
    public record Checkout(String operationId, java.util.List<SaleLine> lines, String paymentMethod,
                           String accountName, String accountId, Integer accountVersion) {
        public Checkout(String operationId, java.util.List<SaleLine> lines) {
            this(operationId, lines, "EFECTIVO", null, null, null);
        }
    }
    public record SaveAccount(String operationId, String accountId, Integer expectedVersion,
                              String paymentMethod, String name, java.util.List<SaleLine> lines) { }
}
