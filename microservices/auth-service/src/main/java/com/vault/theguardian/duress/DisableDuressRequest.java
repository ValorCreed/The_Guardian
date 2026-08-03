package com.vault.theguardian.duress;

import jakarta.validation.constraints.NotBlank;

public record DisableDuressRequest(@NotBlank String currentPassword) {}
