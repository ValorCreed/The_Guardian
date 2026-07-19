package com.vault.theguardian.subscriptionservice.internal;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;
import org.springframework.web.server.ResponseStatusException;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;

@Component
public class InternalServiceKeyValidator {
    private final byte[] expectedKey;

    public InternalServiceKeyValidator(@Value("${internal.service.key}") String internalServiceKey) {
        if (internalServiceKey == null || internalServiceKey.isBlank()) {
            throw new IllegalStateException("INTERNAL_SERVICE_KEY must be configured.");
        }
        this.expectedKey = internalServiceKey.getBytes(StandardCharsets.UTF_8);
    }

    public void requireValid(String suppliedKey) {
        byte[] supplied = suppliedKey == null
                ? new byte[0]
                : suppliedKey.getBytes(StandardCharsets.UTF_8);

        if (!MessageDigest.isEqual(expectedKey, supplied)) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Invalid internal service key.");
        }
    }
}
