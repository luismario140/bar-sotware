package com.appbarpos.catalog.domain;

import java.util.List;

public record SaleReceipt(String id, long totalMinor, List<Line> lines, long occurredAt) {
    public record Line(Product product, long quantity, long unitPriceMinor, long subtotalMinor) { }
}
