package com.vault.theguardian.duress;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record ConfigureDuressRequest(
        @NotBlank String currentPassword,
        @NotBlank @Size(min = 10, max = 128) String duressPassword,
        boolean alertEnabled,
        Long alertContactUserId,
        Integer alertDelayMinutes
) {}
