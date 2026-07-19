package com.vault.theguardian.vaultservice.internal;

import java.util.List;

public record InternalVaultRestoreRequest(
        boolean replaceExisting,
        List<InternalBackupPasswordItem> passwords,
        List<InternalBackupCardItem> cards,
        List<InternalBackupDocumentItem> documents
) {}
