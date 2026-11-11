package com.appbarpos.auth.api;

import com.appbarpos.auth.application.AuthException;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.dao.DataAccessException;

@RestControllerAdvice(assignableTypes = AuthController.class)
public class AuthErrorHandler {
    @ExceptionHandler(AuthException.class)
    public ResponseEntity<ApiError> rejected(AuthException exception) {
        var response = ResponseEntity.status(exception.status());
        if (exception.retryAfterSeconds() > 0) response.header("Retry-After", Long.toString(exception.retryAfterSeconds()));
        return response.body(new ApiError(exception.code(), exception.getMessage(), exception.retryAfterSeconds()));
    }

    @ExceptionHandler(HttpMessageNotReadableException.class)
    public ResponseEntity<ApiError> invalidJson() {
        return ResponseEntity.badRequest().body(new ApiError("INVALID_INPUT", "Revisa los datos del formulario.", 0));
    }

    @ExceptionHandler(DataAccessException.class)
    public ResponseEntity<ApiError> storageFailure() {
        return ResponseEntity.status(503).body(new ApiError("STORAGE_UNAVAILABLE",
                "No se pudo completar la operación. Verifica el acceso local y vuelve a intentarlo.", 0));
    }

    public record ApiError(String code, String message, long retryAfterSeconds) { }
}
