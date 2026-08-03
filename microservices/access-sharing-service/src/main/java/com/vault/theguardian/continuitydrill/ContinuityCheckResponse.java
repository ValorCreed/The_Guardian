package com.vault.theguardian.continuitydrill;

public record ContinuityCheckResponse(
        String code,
        String title,
        String status,
        String detail,
        String actionRoute,
        int weight,
        int earnedPoints
) {}
