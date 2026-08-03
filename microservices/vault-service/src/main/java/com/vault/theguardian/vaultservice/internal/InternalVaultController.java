package com.vault.theguardian.vaultservice.internal;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.*;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.List;

@RestController
@RequestMapping("/internal/vault")
public class InternalVaultController {
    private static final String INTERNAL_KEY_HEADER = "X-Internal-Service-Key";

    private final InternalVaultService service;
    private final byte[] expectedInternalKey;

    public InternalVaultController(
            InternalVaultService service,
            @Value("${internal.service.key}") String internalServiceKey
    ) {
        if (internalServiceKey == null || internalServiceKey.isBlank()) {
            throw new IllegalStateException("INTERNAL_SERVICE_KEY must be configured.");
        }
        this.service = service;
        this.expectedInternalKey =
                internalServiceKey.getBytes(StandardCharsets.UTF_8);
    }

    @GetMapping("/users/{ownerId}/{itemType}")
    public List<InternalVaultItemResponse> list(
            @RequestHeader(value = INTERNAL_KEY_HEADER, required = false) String suppliedKey,
            @PathVariable Long ownerId,
            @PathVariable String itemType
    ) {
        requireValidInternalKey(suppliedKey);
        return service.list(ownerId, itemType);
    }

    @GetMapping("/users/{ownerId}/{itemType}/{itemId}")
    public InternalVaultItemResponse get(
            @RequestHeader(value = INTERNAL_KEY_HEADER, required = false) String suppliedKey,
            @PathVariable Long ownerId,
            @PathVariable String itemType,
            @PathVariable Long itemId
    ) {
        requireValidInternalKey(suppliedKey);
        return service.get(ownerId, itemType, itemId);
    }

    @GetMapping("/users/{ownerId}/documents/{itemId}/download")
    public ResponseEntity<byte[]> download(
            @RequestHeader(value = INTERNAL_KEY_HEADER, required = false) String suppliedKey,
            @PathVariable Long ownerId,
            @PathVariable Long itemId
    ) {
        requireValidInternalKey(suppliedKey);
        InternalDownloadedDocument document = service.download(ownerId, itemId);

        MediaType mediaType;
        try {
            mediaType = MediaType.parseMediaType(document.contentType());
        } catch (Exception ignored) {
            mediaType = MediaType.APPLICATION_OCTET_STREAM;
        }

        return ResponseEntity.ok()
                .contentType(mediaType)
                .contentLength(document.bytes().length)
                .header(HttpHeaders.CONTENT_DISPOSITION,
                        "attachment; filename=\"" + document.fileName() + "\"")
                .body(document.bytes());
    }

    @GetMapping("/backups/users/{ownerId}")
    public InternalVaultBackupResponse exportBackup(
            @RequestHeader(value = INTERNAL_KEY_HEADER, required = false) String suppliedKey,
            @PathVariable Long ownerId
    ) {
        requireValidInternalKey(suppliedKey);
        return service.exportBackup(ownerId);
    }

    @PostMapping("/backups/users/{ownerId}/restore")
    public InternalVaultRestoreResponse restoreBackup(
            @RequestHeader(value = INTERNAL_KEY_HEADER, required = false) String suppliedKey,
            @PathVariable Long ownerId,
            @RequestBody InternalVaultRestoreRequest request
    ) {
        requireValidInternalKey(suppliedKey);
        return service.restoreBackup(ownerId, request);
    }

    @DeleteMapping("/data/users/{ownerId}")
    public InternalVaultDeleteResponse deleteAllUserData(
            @RequestHeader(value = INTERNAL_KEY_HEADER, required = false) String suppliedKey,
            @PathVariable Long ownerId
    ) {
        requireValidInternalKey(suppliedKey);
        return service.deleteAllUserData(ownerId);
    }

    @PostMapping("/password-risks")
    public List<InternalPasswordRiskResponse> passwordRisks(
            @RequestHeader(value = INTERNAL_KEY_HEADER, required = false) String suppliedKey,
            @RequestBody List<Long> ownerIds
    ) {
        requireValidInternalKey(suppliedKey);
        if (ownerIds == null || ownerIds.isEmpty()) {
            return List.of();
        }
        if (ownerIds.size() > 1_000) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "No more than 1000 owner IDs are allowed.");
        }
        if (ownerIds.stream().anyMatch(id -> id == null || id <= 0)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Every owner ID must be greater than zero.");
        }
        return service.passwordRisks(ownerIds.stream().distinct().toList());
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
