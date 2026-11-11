package com.appbarpos.infrastructure.security;

import java.time.Clock;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration
public class SecurityClockConfiguration {
    @Bean
    public Clock securityClock() { return Clock.systemUTC(); }
}
