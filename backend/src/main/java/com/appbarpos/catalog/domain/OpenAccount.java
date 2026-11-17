package com.appbarpos.catalog.domain;

import java.util.List;

public record OpenAccount(String id, int version, String paymentMethod, String name,
                          long totalMinor, List<SaleReceipt.Line> lines, long createdAt, long updatedAt) { }
