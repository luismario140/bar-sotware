package com.appbarpos.auth.api;

import com.appbarpos.auth.application.AuthService;
import com.appbarpos.auth.application.AuthSessions;
import com.appbarpos.auth.application.RecoveryService;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/auth")
public class AuthController {
    private final AuthService service;
    private final AuthSessions sessions;
    private final RecoveryService recovery;

    public AuthController(AuthService service, AuthSessions sessions, RecoveryService recovery) {
        this.service = service;
        this.sessions = sessions;
        this.recovery = recovery;
    }

    @GetMapping("/session")
    public AuthState state(HttpServletRequest request) {
        var admin = sessions.current(request);
        return new AuthState(sessions.configured(), admin.isPresent(), admin.map(value -> value.username()).orElse(null), admin.map(value -> value.recoveryEmail()).orElse(null));
    }

    @PostMapping("/setup")
    public ResponseEntity<AuthState> setup(@RequestBody Credentials input, HttpServletRequest request) {
        var admin = service.setup(input.username(), input.pin(), input.recoveryEmail());
        sessions.establish(request, admin);
        return ResponseEntity.status(201).body(new AuthState(true, true, admin.username(), admin.recoveryEmail()));
    }

    @PostMapping("/login")
    public AuthState login(@RequestBody Credentials input, HttpServletRequest request) {
        var admin = service.login(input.username(), input.pin());
        sessions.establish(request, admin);
        return new AuthState(true, true, admin.username(), admin.recoveryEmail());
    }

    @PostMapping("/logout")
    public ResponseEntity<Void> logout(HttpServletRequest request) {
        if (sessions.current(request).isPresent()) service.logout();
        sessions.invalidate(request);
        return ResponseEntity.noContent().build();
    }

    @PostMapping("/credentials")
    public ResponseEntity<Void> change(@RequestBody CredentialChange input, HttpServletRequest request) {
        var admin = sessions.require(request);
        service.change(admin.credentialVersion(), input.currentPin(), input.username(), input.pin(), input.recoveryEmail());
        sessions.invalidate(request);
        return ResponseEntity.noContent().build();
    }

    @PostMapping("/recovery-request")
    public ResponseEntity<Void> requestRecovery(@RequestBody RecoveryRequest input) {
        recovery.request(input.email());
        return ResponseEntity.accepted().build();
    }

    @PostMapping("/recovery-reset")
    public ResponseEntity<Void> resetRecovery(@RequestBody RecoveryReset input, HttpServletRequest request) {
        recovery.reset(input.email(), input.code(), input.pin());
        sessions.invalidate(request);
        return ResponseEntity.noContent().build();
    }

    public record AuthState(boolean configured, boolean authenticated, String username, String recoveryEmail) { }
    public record Credentials(String username, String pin, String recoveryEmail) {
        @Override public String toString() { return "Credentials[REDACTED]"; }
    }
    public record CredentialChange(String currentPin, String username, String pin, String recoveryEmail) {
        @Override public String toString() { return "CredentialChange[REDACTED]"; }
    }
    public record RecoveryRequest(String email) {
        @Override public String toString() { return "RecoveryRequest[REDACTED]"; }
    }
    public record RecoveryReset(String email, String code, String pin) {
        @Override public String toString() { return "RecoveryReset[REDACTED]"; }
    }
}
