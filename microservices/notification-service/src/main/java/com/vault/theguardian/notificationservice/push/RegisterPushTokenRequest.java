package com.vault.theguardian.notificationservice.push;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

public record RegisterPushTokenRequest(
        @NotBlank @Size(max = 160) String installationId,
        @NotBlank
        @Pattern(regexp = "^(ExponentPushToken|ExpoPushToken)\\[[^\\]]+\\]$")
        @Size(max = 255)
        String expoPushToken,
        @NotBlank @Pattern(regexp = "^(android|ios)$") String platform,
        @NotBlank @Size(max = 180) String deviceName,
        @Size(max = 60) String appVersion
) {}
