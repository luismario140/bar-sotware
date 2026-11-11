package com.appbarpos.system;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

@Service
public class SystemHealthService {
    private final JdbcTemplate jdbc;

    public SystemHealthService(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    public boolean databaseAvailable() {
        return "AppBarPOS".equals(jdbc.queryForObject(
                "SELECT metadata_value FROM app_metadata WHERE metadata_key = 'application'", String.class));
    }
}
