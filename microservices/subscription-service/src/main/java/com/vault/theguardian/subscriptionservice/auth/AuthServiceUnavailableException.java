package com.vault.theguardian.subscriptionservice.auth;

public class AuthServiceUnavailableException extends RuntimeException {
    public AuthServiceUnavailableException(String message, Throwable cause) {
        super(message, cause);
    }
}
