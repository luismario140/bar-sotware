package com.appbarpos.auth.application;

import jakarta.mail.internet.InternetAddress;
import java.util.Locale;
import org.springframework.http.HttpStatus;

public final class RecoveryEmail {
    private RecoveryEmail() { }

    public static String normalize(String value) {
        String email = value == null ? "" : value.strip();
        try {
            if (email.length() > 254 || email.isEmpty() || email.chars().anyMatch(c -> c <= 32 || c >= 127) ||
                    email.contains("<") || email.contains(">") || !email.contains("@")) throw new IllegalArgumentException();
            var address = new InternetAddress(email, true);
            address.validate();
            if (!email.equals(address.getAddress())) throw new IllegalArgumentException();
            return email.substring(0, email.lastIndexOf('@')) + email.substring(email.lastIndexOf('@')).toLowerCase(Locale.ROOT);
        } catch (Exception invalid) {
            throw new AuthException(HttpStatus.BAD_REQUEST, "INVALID_INPUT", "Introduce un correo de recuperación válido.");
        }
    }
}
