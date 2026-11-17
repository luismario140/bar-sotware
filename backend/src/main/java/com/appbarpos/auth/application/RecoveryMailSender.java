package com.appbarpos.auth.application;

public interface RecoveryMailSender {
    boolean available();
    void send(String email, String username, String code);
}
