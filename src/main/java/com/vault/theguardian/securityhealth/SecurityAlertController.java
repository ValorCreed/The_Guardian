package com.vault.theguardian.securityhealth;

import com.vault.theguardian.auth.MessageResponse;
import com.vault.theguardian.integration.notification.NotificationClient;
import com.vault.theguardian.subscription.SubscriptionService;
import com.vault.theguardian.user.User;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

@RestController
@RequestMapping("/vault/security-alerts")
@CrossOrigin
public class SecurityAlertController {
    private final NotificationClient notificationClient;
    private final SubscriptionService subscriptionService;

    public SecurityAlertController(
            NotificationClient notificationClient,
            SubscriptionService subscriptionService
    ) {
        this.notificationClient = notificationClient;
        this.subscriptionService = subscriptionService;
    }

    @PostMapping("/scan")
    public MessageResponse reportSecurityScan(
            @AuthenticationPrincipal User user,
            @Valid @RequestBody SecurityAlertRequest request
    ) {
        if (!subscriptionService.canUseBreachMonitoring(user)) {
            throw new ResponseStatusException(
                    HttpStatus.FORBIDDEN,
                    "Breach monitoring is available on Premium and Family plans."
            );
        }

        notificationClient.notifySecurityScanAlert(
                user,
                request.score(),
                request.totalIssues(),
                request.breachedCount(),
                request.weakCount(),
                request.reusedCount(),
                request.oldCount()
        );

        return new MessageResponse("Security scan alert recorded.");
    }
}
