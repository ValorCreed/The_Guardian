package com.vault.theguardian.backup;

import jakarta.validation.constraints.NotBlank;

public record BackupRestoreRequest(
        @NotBlank
        String encryptedBackup,

        Boolean replaceExisting
) {}
