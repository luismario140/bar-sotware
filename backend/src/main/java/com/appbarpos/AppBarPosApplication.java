package com.appbarpos;

import com.appbarpos.infrastructure.storage.AppDataPaths;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;

@SpringBootApplication
public class AppBarPosApplication {
    public static void main(String[] args) {
        // Resolver antes de inicializar logging, sin escribir en el directorio de instalación.
        System.setProperty("appbarpos.data-dir", AppDataPaths.resolveRoot().toString());
        SpringApplication.run(AppBarPosApplication.class, args);
    }
}
