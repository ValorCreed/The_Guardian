package com.vault.theguardian.backuprecovery.backup;

import jakarta.validation.constraints.NotBlank;

public record BackupRestoreRequest(
        @NotBlank(message = "Encrypted backup is required")
        String encryptedBackup,
        Boolean replaceExisting
) {}
