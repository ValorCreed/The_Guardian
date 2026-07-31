package com.vault.theguardian.backuprecovery.vault;

public record VaultDeleteResponse(
        int deletedPasswordCount,
        int deletedCardCount,
        int deletedDocumentCount,
        int deletedNoteCount,
        int totalDeletedCount
) {}
