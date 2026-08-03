package com.vault.theguardian.estate;

import java.time.LocalDateTime;

public record EstateVaultItemOption(
        Long id,
        String itemType,
        String title,
        LocalDateTime updatedAt
) {}
