package com.vault.theguardian.backuprecovery.auth;

public record AccountResetValidationResponse(Long userId, String email) {}
