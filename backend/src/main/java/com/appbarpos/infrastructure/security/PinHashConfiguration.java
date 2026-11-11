package com.appbarpos.infrastructure.security;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.crypto.password.Pbkdf2PasswordEncoder;
import org.springframework.security.crypto.password.DelegatingPasswordEncoder;
import java.util.Map;

@Configuration
public class PinHashConfiguration {
    @Bean
    public PasswordEncoder pinEncoder() {
        // PBKDF2-HMAC-SHA256, sal aleatoria y 310 000 iteraciones. No requiere servicio externo.
        String algorithm = "pbkdf2@SpringSecurity_v5_8";
        return new DelegatingPasswordEncoder(algorithm,
                Map.of(algorithm, Pbkdf2PasswordEncoder.defaultsForSpringSecurity_v5_8()));
    }
}
