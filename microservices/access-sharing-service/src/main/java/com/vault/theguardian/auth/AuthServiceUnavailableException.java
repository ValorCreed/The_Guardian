package com.vault.theguardian.auth;

public class AuthServiceUnavailableException extends RuntimeException {
    public AuthServiceUnavailableException(String message, Throwable cause) {
        super(message, cause);
    }
}
