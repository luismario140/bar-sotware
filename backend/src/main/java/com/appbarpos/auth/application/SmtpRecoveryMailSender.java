package com.appbarpos.auth.application;

import org.springframework.beans.factory.ObjectProvider;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.mail.SimpleMailMessage;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.stereotype.Component;

@Component
public class SmtpRecoveryMailSender implements RecoveryMailSender {
    private final ObjectProvider<JavaMailSender> sender;
    private final String from;
    private final String host;

    public SmtpRecoveryMailSender(ObjectProvider<JavaMailSender> sender,
            @Value("${appbarpos.mail.from:}") String from, @Value("${spring.mail.host:}") String host) {
        this.sender = sender;
        this.from = from;
        this.host = host;
    }

    @Override public boolean available() { return !host.isBlank() && !from.isBlank() && sender.getIfAvailable() != null; }

    @Override public void send(String email, String username, String code) {
        var message = new SimpleMailMessage();
        message.setFrom(from);
        message.setTo(email);
        message.setSubject("AppBarPOS · Recuperación de acceso");
        message.setText("Solicitaste recuperar el acceso a AppBarPOS.\n\nUsuario: " + username +
                "\nCódigo de recuperación: " + code + "\n\nVence en 10 minutos y solo se puede usar una vez. " +
                "Escríbelo en la aplicación para elegir un PIN nuevo de 4 dígitos.\n" +
                "Si no hiciste esta solicitud, ignora este correo. Tu PIN no ha cambiado.\n" +
                "No compartas este código. AppBarPOS nunca envía tu PIN actual por correo.");
        sender.getObject().send(message);
    }
}
