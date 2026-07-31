package com.vault.theguardian.internal.family;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;

@RestController
@RequestMapping("/internal/family/backups")
public class InternalFamilyBackupController {
    private static final String INTERNAL_KEY_HEADER = "X-Internal-Service-Key";

    private final InternalFamilyBackupService service;
    private final byte[] expectedInternalKey;

    public InternalFamilyBackupController(
            InternalFamilyBackupService service,
            @Value("${internal.service.key}") String internalServiceKey
    ) {
        if (internalServiceKey == null || internalServiceKey.isBlank()) {
            throw new IllegalStateException("INTERNAL_SERVICE_KEY must be configured.");
        }
        this.service = service;
        this.expectedInternalKey = internalServiceKey.getBytes(StandardCharsets.UTF_8);
    }

    @GetMapping("/users/{userId}")
    public InternalFamilyBackupResponse exportForUser(
            @RequestHeader(value = INTERNAL_KEY_HEADER, required = false) String suppliedKey,
            @PathVariable Long userId
    ) {
        requireValidInternalKey(suppliedKey);
        return service.exportForUser(userId);
    }

    private void requireValidInternalKey(String suppliedKey) {
        byte[] supplied = suppliedKey == null
                ? new byte[0]
                : suppliedKey.getBytes(StandardCharsets.UTF_8);
        if (!MessageDigest.isEqual(expectedInternalKey, supplied)) {
            throw new ResponseStatusException(
                    HttpStatus.FORBIDDEN,
                    "Invalid internal service key."
            );
        }
    }
}
