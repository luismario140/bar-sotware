package com.appbarpos.auth.application;

import com.appbarpos.auth.domain.Administrator;
import com.appbarpos.auth.repository.AdministratorRepository;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpSession;
import java.util.Optional;
import org.springframework.stereotype.Component;

@Component
public class AuthSessions {
    private final AdministratorRepository repository;

    public AuthSessions(AdministratorRepository repository) { this.repository = repository; }

    public void establish(HttpServletRequest request, Administrator admin) {
        HttpSession previous = request.getSession(false);
        if (previous != null) previous.invalidate();
        HttpSession session = request.getSession(true);
        session.setAttribute("administratorId", admin.id());
        session.setAttribute("credentialVersion", admin.credentialVersion());
    }

    public Optional<Administrator> current(HttpServletRequest request) {
        HttpSession session = request.getSession(false);
        if (session == null) return Optional.empty();
        Optional<Administrator> admin = repository.find();
        if (admin.isPresent() && Long.valueOf(admin.get().id()).equals(session.getAttribute("administratorId")) &&
                Integer.valueOf(admin.get().credentialVersion()).equals(session.getAttribute("credentialVersion"))) {
            return admin;
        }
        session.invalidate();
        return Optional.empty();
    }

    public Administrator require(HttpServletRequest request) {
        return current(request).orElseThrow(AuthService::unauthenticated);
    }

    public void invalidate(HttpServletRequest request) {
        HttpSession session = request.getSession(false);
        if (session != null) session.invalidate();
    }

    public boolean configured() { return repository.find().isPresent(); }
}
