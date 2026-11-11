package com.appbarpos.catalog.api;

import com.appbarpos.catalog.application.CatalogException;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.dao.DataAccessException;
import org.springframework.http.converter.HttpMessageNotReadableException;

@RestControllerAdvice(assignableTypes = ProductController.class)
public class ProductErrorHandler {
    public record Error(String code, String message) { }
    @ExceptionHandler(CatalogException.class)
    public ResponseEntity<Error> invalid(CatalogException exception) {
        return ResponseEntity.status(exception.status()).body(new Error(exception.code(), exception.getMessage()));
    }
    @ExceptionHandler(HttpMessageNotReadableException.class)
    public ResponseEntity<Error> body() { return ResponseEntity.badRequest().body(new Error("INVALID_INPUT", "Revisa los datos del producto.")); }
    @ExceptionHandler({DataAccessException.class, java.io.IOException.class, java.io.UncheckedIOException.class})
    public ResponseEntity<Error> storage() {
        return ResponseEntity.status(503).body(new Error("STORAGE_UNAVAILABLE", "No se pudo guardar o leer el producto. Conserva el formulario y vuelve a intentarlo."));
    }
}
