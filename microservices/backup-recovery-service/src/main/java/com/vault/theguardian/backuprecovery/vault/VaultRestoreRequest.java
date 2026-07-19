package com.vault.theguardian.backuprecovery.vault;

import java.util.List;

public record VaultRestoreRequest(
        boolean replaceExisting,
        List<BackupPasswordItem> passwords,
        List<BackupCardItem> cards,
        List<BackupDocumentItem> documents
) {}
