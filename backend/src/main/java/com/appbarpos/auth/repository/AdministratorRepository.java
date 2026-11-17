package com.appbarpos.auth.repository;

import com.appbarpos.auth.domain.Administrator;
import java.util.Optional;
import java.util.UUID;
import org.springframework.context.annotation.DependsOn;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

@Repository
@DependsOn("flyway")
public class AdministratorRepository {
    private final JdbcTemplate jdbc;

    public AdministratorRepository(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    public Optional<Administrator> find() {
        return jdbc.query("SELECT * FROM administrator WHERE id = 1", (rs, row) -> new Administrator(
                rs.getLong("id"), rs.getString("username"), rs.getString("pin_hash"),
                rs.getInt("credential_version"), rs.getInt("failed_attempts"), rs.getLong("locked_until"), rs.getString("recovery_email")))
                .stream().findFirst();
    }

    public void create(String username, String hash, String email, long now) {
        jdbc.update("INSERT INTO administrator (id, username, pin_hash, recovery_email, created_at, updated_at) VALUES (1, ?, ?, ?, ?, ?)",
                username, hash, email, now, now);
    }

    public void attempts(int failed, long lockedUntil) {
        jdbc.update("UPDATE administrator SET failed_attempts = ?, locked_until = ? WHERE id = 1", failed, lockedUntil);
    }

    public void change(String username, String hash, String email, long now) {
        jdbc.update("UPDATE administrator SET username = ?, pin_hash = ?, recovery_email = ?, credential_version = credential_version + 1, " +
                "failed_attempts = 0, locked_until = 0, updated_at = ? WHERE id = 1", username, hash, email, now);
        jdbc.update("UPDATE administrator_recovery SET code_hash = NULL, email = NULL, expires_at = 0 WHERE id = 1");
    }

    public void audit(String action, long now, String previous, String next) {
        jdbc.update("INSERT INTO administrator_audit (id, administrator_id, action, occurred_at, previous_username, new_username) " +
                "VALUES (?, 1, ?, ?, ?, ?)", UUID.randomUUID().toString(), action, now, previous, next);
    }
}
