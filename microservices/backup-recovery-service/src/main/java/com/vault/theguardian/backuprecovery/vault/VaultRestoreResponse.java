package com.vault.theguardian.backuprecovery.vault;

public record VaultRestoreResponse(
        boolean replaceExisting,
        int restoredPasswordCount,
        int restoredCardCount,
        int restoredDocumentCount,
        int totalRestoredCount
) {}
