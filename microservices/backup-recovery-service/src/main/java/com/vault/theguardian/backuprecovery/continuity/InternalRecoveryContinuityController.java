package com.vault.theguardian.backuprecovery.continuity;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;

@RestController
@RequestMapping("/internal/continuity")
public class InternalRecoveryContinuityController {
    private static final String INTERNAL_KEY_HEADER = "X-Internal-Service-Key";

    private final RecoveryContinuityService service;
    private final byte[] expectedInternalKey;

    public InternalRecoveryContinuityController(
            RecoveryContinuityService service,
            @Value("${internal.service.key}") String internalServiceKey
    ) {
        if (internalServiceKey == null || internalServiceKey.isBlank()) {
            throw new IllegalStateException("INTERNAL_SERVICE_KEY must be configured.");
        }
        this.service = service;
        this.expectedInternalKey = internalServiceKey.getBytes(StandardCharsets.UTF_8);
    }

    @GetMapping("/users/{ownerId}")
    public RecoveryContinuitySnapshotResponse snapshot(
            @RequestHeader(value = INTERNAL_KEY_HEADER, required = false) String suppliedKey,
            @PathVariable Long ownerId
    ) {
        requireInternalKey(suppliedKey);
        return service.snapshot(ownerId);
    }

    private void requireInternalKey(String suppliedKey) {
        byte[] supplied = suppliedKey == null
                ? new byte[0]
                : suppliedKey.getBytes(StandardCharsets.UTF_8);
        if (!MessageDigest.isEqual(expectedInternalKey, supplied)) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Invalid internal service key.");
        }
    }
}
