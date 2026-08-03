package com.vault.theguardian.duress;

import jakarta.validation.constraints.NotBlank;

public record OpenDuressPreviewRequest(@NotBlank String currentPassword) {}
