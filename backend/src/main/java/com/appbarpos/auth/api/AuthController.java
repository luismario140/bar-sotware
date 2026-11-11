package com.appbarpos.auth.api;

import com.appbarpos.auth.application.AuthService;
import com.appbarpos.auth.application.AuthSessions;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/auth")
public class AuthController {
    private final AuthService service;
    private final AuthSessions sessions;

    public AuthController(AuthService service, AuthSessions sessions) {
        this.service = service;
        this.sessions = sessions;
    }

    @GetMapping("/session")
    public AuthState state(HttpServletRequest request) {
        var admin = sessions.current(request);
        return new AuthState(sessions.configured(), admin.isPresent(), admin.map(value -> value.username()).orElse(null));
    }

    @PostMapping("/setup")
    public ResponseEntity<AuthState> setup(@RequestBody Credentials input, HttpServletRequest request) {
        var admin = service.setup(input.username(), input.pin());
        sessions.establish(request, admin);
        return ResponseEntity.status(201).body(new AuthState(true, true, admin.username()));
    }

    @PostMapping("/login")
    public AuthState login(@RequestBody Credentials input, HttpServletRequest request) {
        var admin = service.login(input.username(), input.pin());
        sessions.establish(request, admin);
        return new AuthState(true, true, admin.username());
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
        service.change(admin.credentialVersion(), input.currentPin(), input.username(), input.pin());
        sessions.invalidate(request);
        return ResponseEntity.noContent().build();
    }

    public record AuthState(boolean configured, boolean authenticated, String username) { }
    public record Credentials(String username, String pin) {
        @Override public String toString() { return "Credentials[REDACTED]"; }
    }
    public record CredentialChange(String currentPin, String username, String pin) {
        @Override public String toString() { return "CredentialChange[REDACTED]"; }
    }
}
