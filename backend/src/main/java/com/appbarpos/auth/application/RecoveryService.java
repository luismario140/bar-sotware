package com.appbarpos.auth.application;

import com.appbarpos.auth.repository.AdministratorRepository;
import java.security.SecureRandom;
import java.time.Clock;
import java.util.Locale;
import java.util.concurrent.Executor;
import java.util.concurrent.RejectedExecutionException;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

@Service
public class RecoveryService {
    private final AdministratorRepository repository;
    private final JdbcTemplate jdbc;
    private final PasswordEncoder encoder;
    private final Clock clock;
    private final RecoveryMailSender mail;
    private final Executor executor;
    private final TransactionTemplate transaction;
    private final SecureRandom random = new SecureRandom();

    public RecoveryService(AdministratorRepository repository, JdbcTemplate jdbc, PasswordEncoder encoder, Clock clock,
            RecoveryMailSender mail, @Qualifier("recoveryExecutor") Executor executor, PlatformTransactionManager manager) {
        this.repository = repository; this.jdbc = jdbc; this.encoder = encoder; this.clock = clock;
        this.mail = mail; this.executor = executor; transaction = new TransactionTemplate(manager);
    }

    public synchronized void request(String recoveryEmail) {
        String email = RecoveryEmail.normalize(recoveryEmail);
        if (!mail.available()) throw new AuthException(HttpStatus.SERVICE_UNAVAILABLE, "MAIL_UNAVAILABLE",
                "El envío de correos no está configurado en este equipo. Contacta con Mario Dev para activarlo.");
        String code = String.format(Locale.ROOT, "%08d", random.nextInt(100000000));
        // El mismo trabajo para un correo coincidente o desconocido; el envío se hace fuera de la solicitud.
        String hash = encoder.encode(code);
        var recipient = transaction.execute(status -> {
            long now = clock.millis();
            State before = state();
            long window = now - before.windowStart() >= 3600000 ? now : before.windowStart();
            int count = window == now ? 0 : before.requests();
            long wait = Math.max(before.nextRequestAt() - now, count >= 5 ? window + 3600000 - now : 0);
            if (wait > 0) throw new AuthException(HttpStatus.TOO_MANY_REQUESTS, "LOCKED",
                    "Espera antes de solicitar otro código de recuperación.", Math.max(1, (wait + 999) / 1000));
            jdbc.update("UPDATE administrator_recovery SET next_request_at = ?, window_start = ?, requests = ? WHERE id = 1",
                    now + 60000, window, count + 1);
            var admin = repository.find().orElse(null);
            if (admin == null || !email.equals(admin.recoveryEmail())) return null;
            jdbc.update("UPDATE administrator_recovery SET code_hash = ?, email = ?, credential_version = ?, expires_at = ?, attempts = 0 WHERE id = 1",
                    hash, email, admin.credentialVersion(), now + 600000);
            return admin;
        });
        try {
            executor.execute(() -> {
                if (recipient == null) return;
                try { mail.send(email, recipient.username(), code); }
                catch (RuntimeException failure) {
                    jdbc.update("UPDATE administrator_recovery SET code_hash = NULL, expires_at = 0 WHERE id = 1 AND code_hash = ?", hash);
                    // Nunca incluir el mensaje de la excepción: puede contener dirección, código o credenciales SMTP.
                    org.slf4j.LoggerFactory.getLogger(RecoveryService.class).warn("No se pudo enviar el correo de recuperación. Revisa conexión y configuración SMTP.");
                }
            });
        } catch (RejectedExecutionException busy) {
            jdbc.update("UPDATE administrator_recovery SET code_hash = NULL, expires_at = 0 WHERE id = 1 AND code_hash = ?", hash);
            throw new AuthException(HttpStatus.SERVICE_UNAVAILABLE, "MAIL_UNAVAILABLE", "El envío está ocupado. Inténtalo más tarde.");
        }
    }

    public synchronized void reset(String recoveryEmail, String code, String pin) {
        String email = RecoveryEmail.normalize(recoveryEmail);
        if (code == null || !code.matches("[0-9]{8}") || pin == null || !pin.matches("[0-9]{4}")) {
            throw new AuthException(HttpStatus.BAD_REQUEST, "INVALID_INPUT", "Introduce el código de 8 dígitos y un PIN nuevo de 4 dígitos.");
        }
        boolean changed = Boolean.TRUE.equals(transaction.execute(status -> {
            State recovery = state();
            var admin = repository.find().orElse(null);
            if (recovery.hash() == null || recovery.expiresAt() <= clock.millis() || recovery.attempts() >= 5 || admin == null) return false;
            boolean matches = encoder.matches(code, recovery.hash());
            if (!matches || !email.equals(recovery.email()) || !email.equals(admin.recoveryEmail()) || admin.credentialVersion() != recovery.version()) {
                jdbc.update("UPDATE administrator_recovery SET attempts = attempts + 1, code_hash = CASE WHEN attempts >= 4 THEN NULL ELSE code_hash END WHERE id = 1");
                return false;
            }
            repository.change(admin.username(), encoder.encode(pin), email, clock.millis());
            repository.audit("CREDENTIALS_CHANGED", clock.millis(), admin.username(), admin.username());
            return true;
        }));
        if (!changed) throw new AuthException(HttpStatus.BAD_REQUEST, "INVALID_RECOVERY", "Código inválido o vencido. Comprueba el correo o solicita un código nuevo.");
    }

    private State state() {
        return jdbc.queryForObject("SELECT * FROM administrator_recovery WHERE id = 1", (rs, row) -> new State(
                rs.getString("code_hash"), rs.getString("email"), rs.getInt("credential_version"), rs.getLong("expires_at"),
                rs.getInt("attempts"), rs.getLong("next_request_at"), rs.getLong("window_start"), rs.getInt("requests")));
    }
    private record State(String hash, String email, int version, long expiresAt, int attempts, long nextRequestAt, long windowStart, int requests) { }
}
