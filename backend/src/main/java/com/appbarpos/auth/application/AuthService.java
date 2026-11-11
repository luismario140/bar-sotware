package com.appbarpos.auth.application;

import com.appbarpos.auth.domain.Administrator;
import com.appbarpos.auth.repository.AdministratorRepository;
import java.time.Clock;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

@Service
public class AuthService {
    private final AdministratorRepository repository;
    private final PasswordEncoder encoder;
    private final TransactionTemplate transaction;
    private final Clock clock;
    private final int maxAttempts;
    private final long lockMillis;
    private final String dummyHash;

    public AuthService(AdministratorRepository repository, PasswordEncoder encoder,
                       PlatformTransactionManager manager, Clock clock,
                       @Value("${appbarpos.auth.max-attempts:5}") int maxAttempts,
                       @Value("${appbarpos.auth.lock-seconds:60}") long lockSeconds) {
        if (maxAttempts < 1 || lockSeconds < 1 || lockSeconds > 86400) {
            throw new IllegalArgumentException("Configuración de bloqueo inválida");
        }
        this.repository = repository;
        this.encoder = encoder;
        transaction = new TransactionTemplate(manager);
        this.clock = clock;
        this.maxAttempts = maxAttempts;
        lockMillis = lockSeconds * 1000;
        dummyHash = encoder.encode(java.util.UUID.randomUUID().toString());
    }

    public synchronized Administrator setup(String username, String pin) {
        String normalized = validate(username, pin);
        return transaction.execute(status -> {
            if (repository.find().isPresent()) {
                throw new AuthException(HttpStatus.CONFLICT, "ALREADY_CONFIGURED", "El administrador ya está configurado.");
            }
            long now = clock.millis();
            repository.create(normalized, encoder.encode(pin), now);
            repository.audit("SETUP", now, null, normalized);
            return repository.find().orElseThrow();
        });
    }

    public synchronized Administrator login(String username, String pin) {
        String normalized = validate(username, pin);
        Outcome outcome = transaction.execute(status -> {
            Administrator admin = repository.find().orElse(null);
            if (admin == null) {
                encoder.matches(pin, dummyHash);
                return new Outcome(null, invalidCredentials());
            }
            AuthException failure = verify(admin, normalized, pin);
            if (failure != null) return new Outcome(null, failure);
            repository.audit("LOGIN_SUCCEEDED", clock.millis(), null, null);
            return new Outcome(repository.find().orElseThrow(), null);
        });
        return result(outcome);
    }

    public synchronized void change(long credentialVersion, String currentPin, String username, String pin) {
        String normalized = validate(username, pin);
        if (currentPin == null || !currentPin.matches("[0-9]{4,12}")) {
            throw new AuthException(HttpStatus.BAD_REQUEST, "INVALID_INPUT", "Introduce el PIN actual de 4 a 12 dígitos.");
        }
        Outcome outcome = transaction.execute(status -> {
            Administrator admin = repository.find().orElseThrow(AuthService::unauthenticated);
            if (admin.credentialVersion() != credentialVersion) throw unauthenticated();
            AuthException failure = verify(admin, admin.username(), currentPin);
            if (failure != null) return new Outcome(null, failure);
            repository.change(normalized, encoder.encode(pin), clock.millis());
            repository.audit("CREDENTIALS_CHANGED", clock.millis(), admin.username(), normalized);
            return new Outcome(repository.find().orElseThrow(), null);
        });
        result(outcome);
    }

    public synchronized void logout() {
        transaction.executeWithoutResult(status -> repository.audit("LOGOUT", clock.millis(), null, null));
    }

    private AuthException verify(Administrator admin, String username, String pin) {
        long now = clock.millis();
        if (admin.lockedUntil() > now) return locked(admin.lockedUntil() - now);
        boolean correctPin = encoder.matches(pin, admin.pinHash());
        if (!correctPin || !admin.username().equals(username)) {
            int failed = admin.lockedUntil() > 0 ? 1 : admin.failedAttempts() + 1;
            boolean blocked = failed >= maxAttempts;
            repository.attempts(blocked ? 0 : failed, blocked ? now + lockMillis : 0);
            repository.audit("LOGIN_FAILED", now, null, null);
            return blocked ? locked(lockMillis) : invalidCredentials();
        }
        repository.attempts(0, 0);
        return null;
    }

    private Administrator result(Outcome outcome) {
        if (outcome.failure() != null) throw outcome.failure();
        return outcome.administrator();
    }

    private String validate(String username, String pin) {
        if (username == null || username.strip().isEmpty() || username.strip().length() > 60 ||
                username.codePoints().anyMatch(Character::isISOControl) || pin == null || !pin.matches("[0-9]{4,12}")) {
            throw new AuthException(HttpStatus.BAD_REQUEST, "INVALID_INPUT",
                    "Introduce un usuario de 1 a 60 caracteres y un PIN de 4 a 12 dígitos.");
        }
        return username.strip();
    }

    private AuthException invalidCredentials() {
        return new AuthException(HttpStatus.UNAUTHORIZED, "INVALID_CREDENTIALS", "Usuario o PIN incorrectos.");
    }

    private AuthException locked(long millis) {
        return new AuthException(HttpStatus.TOO_MANY_REQUESTS, "LOCKED",
                "Demasiados intentos. Espera antes de volver a intentarlo.", Math.max(1, (millis + 999) / 1000));
    }

    public static AuthException unauthenticated() {
        return new AuthException(HttpStatus.UNAUTHORIZED, "UNAUTHENTICATED", "Inicia sesión para continuar.");
    }

    private record Outcome(Administrator administrator, AuthException failure) { }
}
