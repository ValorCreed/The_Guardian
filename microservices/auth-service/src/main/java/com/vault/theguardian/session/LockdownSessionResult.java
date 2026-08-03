package com.vault.theguardian.session;

public record LockdownSessionResult(
        int sessionsRevoked,
        int biometricsRevoked
) {}
