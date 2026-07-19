package com.vault.theguardian.vaultservice.auth;

public class AuthServiceUnavailableException extends RuntimeException {
    public AuthServiceUnavailableException(String message, Throwable cause) {
        super(message, cause);
    }
}
