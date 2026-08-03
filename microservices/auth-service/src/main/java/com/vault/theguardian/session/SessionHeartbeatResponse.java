package com.vault.theguardian.session;

public record SessionHeartbeatResponse(
        boolean active,
        String message
) {}
