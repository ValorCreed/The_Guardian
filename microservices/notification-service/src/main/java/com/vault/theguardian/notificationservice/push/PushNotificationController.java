package com.vault.theguardian.notificationservice.push;

import com.vault.theguardian.notificationservice.auth.AuthenticatedUser;
import jakarta.validation.Valid;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/vault/notifications")
public class PushNotificationController {
    private final PushTokenService tokenService;
    private final PushPreferenceService preferenceService;

    public PushNotificationController(
            PushTokenService tokenService,
            PushPreferenceService preferenceService
    ) {
        this.tokenService = tokenService;
        this.preferenceService = preferenceService;
    }

    @PutMapping("/push-token")
    public PushTokenResponse register(
            @AuthenticationPrincipal AuthenticatedUser user,
            @Valid @RequestBody RegisterPushTokenRequest request
    ) {
        return tokenService.register(user.userId(), request);
    }

    @DeleteMapping("/push-token/{installationId}")
    public void unregister(
            @AuthenticationPrincipal AuthenticatedUser user,
            @PathVariable String installationId
    ) {
        tokenService.unregister(user.userId(), installationId);
    }

    @GetMapping("/preferences")
    public NotificationPreferenceResponse preferences(
            @AuthenticationPrincipal AuthenticatedUser user
    ) {
        return preferenceService.get(user.userId());
    }

    @PutMapping("/preferences")
    public NotificationPreferenceResponse updatePreferences(
            @AuthenticationPrincipal AuthenticatedUser user,
            @RequestBody UpdateNotificationPreferenceRequest request
    ) {
        return preferenceService.update(user.userId(), request);
    }
}
