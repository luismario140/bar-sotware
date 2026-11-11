package com.appbarpos.catalog.domain;

public record Product(String id, String name, String category, boolean active, int version,
                      Long unitPriceMinor, Long shotPriceMinor, String imageId) { }
