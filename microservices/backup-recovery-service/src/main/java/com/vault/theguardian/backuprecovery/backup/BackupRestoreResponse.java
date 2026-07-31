package com.vault.theguardian.backuprecovery.backup;

import java.time.LocalDateTime;

public record BackupRestoreResponse(
        String message,
        LocalDateTime restoredAt,
        boolean replaceExisting,
        int restoredPasswordCount,
        int restoredCardCount,
        int restoredDocumentCount,
        int totalRestoredCount
) {}
