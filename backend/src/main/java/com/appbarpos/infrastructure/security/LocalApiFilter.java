package com.appbarpos.infrastructure.security;

import com.appbarpos.auth.application.AuthSessions;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.UUID;
import java.util.Set;
import org.springframework.stereotype.Component;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.web.filter.OncePerRequestFilter;

@Component
public class LocalApiFilter extends OncePerRequestFilter {
    private final byte[] token;
    private final AuthSessions sessions;
    private static final Set<String> OPEN_SESSION_PATHS = Set.of("/api/auth/session", "/api/auth/setup",
            "/api/auth/login", "/api/auth/logout", "/api/system/shutdown");

    public LocalApiFilter(AuthSessions sessions, @Value("${appbarpos.api-token:}") String configured) {
        this.sessions = sessions;
        token = (configured == null || configured.isBlank() ? UUID.randomUUID().toString() : configured)
                .getBytes(StandardCharsets.UTF_8);
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response,
                                  FilterChain chain) throws ServletException, IOException {
        String path = request.getServletPath();
        if (path.equals("/api/products") || path.startsWith("/api/products/")) {
            response.setHeader("Cache-Control", "no-store");
            if (request.getContentLengthLong() > 8 * 1024 * 1024) {
                reject(response, 413, "INVALID_INPUT", "La solicitud de producto supera el tamaño permitido.");
                return;
            }
        }
        if (path.startsWith("/api/auth/")) {
            response.setHeader("Cache-Control", "no-store");
            response.setHeader("Pragma", "no-cache");
            if (request.getContentLengthLong() > 4096) {
                reject(response, 413, "INVALID_INPUT", "La solicitud es demasiado grande.");
                return;
            }
        }
        // Diagnóstico de solo lectura y sin datos del negocio, accesible en desarrollo.
        boolean health = path.equals("/api/system/health") && request.getMethod().equals("GET");
        String supplied = request.getHeader("X-AppBarPOS-Token");
        if (path.startsWith("/api/") && !health && (supplied == null ||
                !MessageDigest.isEqual(token, supplied.getBytes(StandardCharsets.UTF_8)))) {
            reject(response, 401, "CHANNEL_REQUIRED", "No se pudo validar el canal local de la aplicación.");
            return;
        }
        String origin = request.getHeader("Origin");
        if (!health && path.startsWith("/api/") && origin != null &&
                !Set.of("http://127.0.0.1:5173", "http://127.0.0.1:4173").contains(origin)) {
            reject(response, 403, "ORIGIN_REJECTED", "Origen de solicitud no autorizado.");
            return;
        }
        if (path.startsWith("/api/") && !health && !OPEN_SESSION_PATHS.contains(path) &&
                sessions.current(request).isEmpty()) {
            reject(response, 401, "UNAUTHENTICATED", "Inicia sesión para continuar.");
            return;
        }
        chain.doFilter(request, response);
    }

    private void reject(HttpServletResponse response, int status, String code, String message) throws IOException {
        response.setStatus(status);
        response.setContentType("application/json;charset=UTF-8");
        // Únicamente constantes internas; no interpolar entradas del usuario.
        response.getWriter().write("{\"code\":\"" + code + "\",\"message\":\"" + message + "\",\"retryAfterSeconds\":0}");
    }
}
