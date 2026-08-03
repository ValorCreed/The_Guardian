package com.vault.theguardian.backuprecovery.recoverycircle;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;

import java.util.List;

public record UpdateRecoveryCircleRequest(
        @NotNull(message = "Enabled is required") Boolean enabled,
        Integer threshold,
        List<Long> memberUserIds,
        @NotBlank(message = "Account password is required") String password
) {}
