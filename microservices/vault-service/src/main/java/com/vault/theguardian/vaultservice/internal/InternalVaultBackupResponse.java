package com.vault.theguardian.vaultservice.internal;

import java.util.List;

public record InternalVaultBackupResponse(
        List<InternalBackupPasswordItem> passwords,
        List<InternalBackupCardItem> cards,
        List<InternalBackupDocumentItem> documents,
        int passwordCount,
        int cardCount,
        int documentCount,
        int totalItemCount
) {}
