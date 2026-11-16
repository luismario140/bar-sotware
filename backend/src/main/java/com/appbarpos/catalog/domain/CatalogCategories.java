package com.appbarpos.catalog.domain;

import com.appbarpos.catalog.application.CatalogException;
import java.text.Normalizer;
import java.util.List;
import java.util.Locale;

public final class CatalogCategories {
    public static final List<String> ALL = List.of("Cervezas", "Aguardientes", "Rones", "Tequilas", "Whiskies",
            "Cócteles", "Bebidas sin alcohol - energizantes", "Bebidas preparadas mezclas");
    private CatalogCategories() { }

    public static String require(String value) {
        String key = normalize(value == null ? "" : value.strip());
        return ALL.stream().filter(category -> normalize(category).equals(key)).findFirst()
                .orElseThrow(() -> CatalogException.invalid("Selecciona una de las ocho categorías del inventario."));
    }

    public static boolean requiresVolume(String category) {
        return category.equals("Aguardientes") || category.equals("Rones");
    }

    private static String normalize(String value) {
        return Normalizer.normalize(value, Normalizer.Form.NFD).replaceAll("\\p{M}", "").toLowerCase(Locale.ROOT);
    }
}
