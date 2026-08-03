package com.vault.theguardian.vaultservice.auth;

public record AuthenticatedUser(Long userId, String email, String sessionMode) {
    public boolean isDuress() {
        return "DURESS".equalsIgnoreCase(sessionMode);
    }
}
