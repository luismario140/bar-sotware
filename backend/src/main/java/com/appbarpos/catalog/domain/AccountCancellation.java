package com.appbarpos.catalog.domain;

import java.util.List;

public record AccountCancellation(String id, OpenAccount account, long administratorId,
                                   long occurredAt, List<Product> releasedProducts) { }
