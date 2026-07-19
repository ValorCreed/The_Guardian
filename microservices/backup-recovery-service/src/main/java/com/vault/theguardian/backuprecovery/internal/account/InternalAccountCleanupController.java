package com.vault.theguardian.backuprecovery.internal.account;

import com.vault.theguardian.backuprecovery.recovery.RecoveryKitRepository;
import jakarta.transaction.Transactional;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;

@RestController
@RequestMapping("/internal/account")
public class InternalAccountCleanupController {
    private static final String INTERNAL_KEY_HEADER = "X-Internal-Service-Key";

    private final RecoveryKitRepository recoveryKitRepository;
    private final byte[] expectedInternalKey;

    public InternalAccountCleanupController(
            RecoveryKitRepository recoveryKitRepository,
            @Value("${internal.service.key}") String internalServiceKey
    ) {
        if (internalServiceKey == null || internalServiceKey.isBlank()) {
            throw new IllegalStateException("INTERNAL_SERVICE_KEY must be configured.");
        }
        this.recoveryKitRepository = recoveryKitRepository;
        this.expectedInternalKey = internalServiceKey.getBytes(StandardCharsets.UTF_8);
    }

    @DeleteMapping("/users/{userId}")
    @Transactional
    public void deleteUserData(
            @RequestHeader(value = INTERNAL_KEY_HEADER, required = false) String suppliedKey,
            @PathVariable Long userId
    ) {
        requireValidInternalKey(suppliedKey);
        recoveryKitRepository.deleteByUserId(userId);
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
