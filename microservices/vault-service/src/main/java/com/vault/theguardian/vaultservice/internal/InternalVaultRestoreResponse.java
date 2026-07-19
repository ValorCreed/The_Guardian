package com.vault.theguardian.vaultservice.internal;

public record InternalVaultRestoreResponse(
        boolean replaceExisting,
        int restoredPasswordCount,
        int restoredCardCount,
        int restoredDocumentCount,
        int totalRestoredCount
) {}
