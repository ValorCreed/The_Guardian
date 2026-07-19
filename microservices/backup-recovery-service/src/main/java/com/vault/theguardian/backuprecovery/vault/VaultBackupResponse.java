package com.vault.theguardian.backuprecovery.vault;

import java.util.List;

public record VaultBackupResponse(
        List<BackupPasswordItem> passwords,
        List<BackupCardItem> cards,
        List<BackupDocumentItem> documents,
        int passwordCount,
        int cardCount,
        int documentCount,
        int totalItemCount
) {}
