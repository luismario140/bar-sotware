package com.appbarpos.catalog.api;

public final class ProductCommands {
    private ProductCommands() { }

    public record Save(String operationId, Integer expectedVersion, String name, String category,
                       Boolean active, String unitPrice, String shotPrice, String imageBase64, boolean removeImage) {
        @Override public String toString() { return "ProductSave[image redacted]"; }
    }
    public record Status(String operationId, Integer expectedVersion, Boolean active) { }
}
