package com.vault.theguardian.vaultservice.internal;

public record InternalVaultDeleteResponse(
        int deletedPasswordCount,
        int deletedCardCount,
        int deletedDocumentCount,
        int deletedNoteCount,
        int totalDeletedCount
) {}
