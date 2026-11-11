package com.appbarpos.system;

import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/system")
public class SystemHealthController {
    private final SystemHealthService service;

    public SystemHealthController(SystemHealthService service) {
        this.service = service;
    }

    @GetMapping("/health")
    public ResponseEntity<HealthStatus> health() {
        try {
            if (service.databaseAvailable()) {
                return ResponseEntity.ok(new HealthStatus("UP", "AppBarPOS", "UP"));
            }
        } catch (org.springframework.dao.DataAccessException ignored) {
            // El diagnóstico público no expone rutas, SQL ni trazas.
        }
        return ResponseEntity.status(503).body(new HealthStatus("DOWN", "AppBarPOS", "DOWN"));
    }

    public record HealthStatus(String status, String application, String database) { }
}
