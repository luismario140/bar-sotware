package com.appbarpos.catalog.domain;

import java.util.List;

public record SalesHistory(List<SaleReceipt> sales, int page, boolean hasNext) { }
