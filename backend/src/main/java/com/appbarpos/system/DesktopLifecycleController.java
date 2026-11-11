package com.appbarpos.system;

import org.springframework.context.ConfigurableApplicationContext;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class DesktopLifecycleController {
    private final ConfigurableApplicationContext context;

    public DesktopLifecycleController(ConfigurableApplicationContext context) {
        this.context = context;
    }

    // LocalApiFilter exige el token efímero del proceso padre. No es cierre de caja.
    @PostMapping("/api/system/shutdown")
    public ResponseEntity<Void> shutdown() {
        Thread closer = new Thread(() -> {
            try {
                Thread.sleep(300);
                context.close();
            } catch (InterruptedException exception) {
                Thread.currentThread().interrupt();
            }
        }, "desktop-shutdown");
        closer.setDaemon(true);
        closer.start();
        return ResponseEntity.accepted().build();
    }
}
