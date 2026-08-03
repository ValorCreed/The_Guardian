package com.vault.theguardian.backuprecovery.recoverycircle;

import jakarta.validation.constraints.NotBlank;

public record RecoveryCircleStatusRequest(
        @NotBlank(message = "Request ID is required") String requestId,
        @NotBlank(message = "Recovery code is required") String recoveryCode
) {}
