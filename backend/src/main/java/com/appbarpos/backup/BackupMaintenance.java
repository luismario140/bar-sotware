package com.appbarpos.backup;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.util.Set;
import java.util.concurrent.locks.Lock;
import java.util.concurrent.locks.ReentrantReadWriteLock;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

@Component
@Order(Ordered.HIGHEST_PRECEDENCE + 10)
public class BackupMaintenance extends OncePerRequestFilter {
    private final ReentrantReadWriteLock gate = new ReentrantReadWriteLock(true);
    private volatile boolean restoring;
    private static final Set<String> EXCLUSIVE = Set.of("/api/backups/create", "/api/backups/prepare-restore");
    private static final Set<String> ALLOWED = Set.of("/api/system/health", "/api/system/shutdown", "/api/backups/cancel-restore");

    public void restoring(boolean value) { restoring = value; }

    @Override protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain) throws IOException, ServletException {
        String path = request.getServletPath();
        if (!path.startsWith("/api/")) { chain.doFilter(request, response); return; }
        Lock lock = EXCLUSIVE.contains(path) ? gate.writeLock() : gate.readLock();
        lock.lock();
        try {
            if (restoring && !ALLOWED.contains(path)) {
                response.setStatus(503);
                response.setContentType("application/json;charset=UTF-8");
                response.setHeader("Cache-Control", "no-store");
                response.getWriter().write("{\"code\":\"RESTORING\",\"message\":\"La restauración está en curso. Espera a que la aplicación vuelva a iniciar.\"}");
                return;
            }
            chain.doFilter(request, response);
        } finally { lock.unlock(); }
    }
}
