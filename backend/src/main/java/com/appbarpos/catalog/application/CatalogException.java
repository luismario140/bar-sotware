package com.appbarpos.catalog.application;

import org.springframework.http.HttpStatus;

public class CatalogException extends RuntimeException {
    private final HttpStatus status;
    private final String code;

    public CatalogException(HttpStatus status, String code, String message) {
        super(message);
        this.status = status;
        this.code = code;
    }
    public HttpStatus status() { return status; }
    public String code() { return code; }
    public static CatalogException invalid(String message) {
        return new CatalogException(HttpStatus.BAD_REQUEST, "INVALID_INPUT", message);
    }
    public static CatalogException missing() {
        return new CatalogException(HttpStatus.NOT_FOUND, "NOT_FOUND", "El producto o su imagen no están disponibles.");
    }
}
