package com.appbarpos.auth.domain;

public record Administrator(long id, String username, String pinHash, int credentialVersion,
                            int failedAttempts, long lockedUntil) {
    @Override
    public String toString() {
        return "Administrator[id=" + id + "]";
    }
}
