package com.appbarpos.system;

import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.boot.web.server.context.WebServerApplicationContext;
import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Component;

@Component
public class DesktopReadyListener {
    @EventListener
    public void ready(ApplicationReadyEvent event) {
        if (event.getApplicationContext() instanceof WebServerApplicationContext context) {
            // Protocolo mínimo con el proceso padre; nunca contiene credenciales.
            System.out.println("APPBARPOS_READY=" + context.getWebServer().getPort());
        }
    }
}
