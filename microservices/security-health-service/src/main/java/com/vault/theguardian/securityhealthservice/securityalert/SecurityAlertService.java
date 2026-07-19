package com.vault.theguardian.securityhealthservice.securityalert;

import com.vault.theguardian.securityhealthservice.auth.AuthenticatedUser;
import com.vault.theguardian.securityhealthservice.common.MessageResponse;
import com.vault.theguardian.securityhealthservice.notification.NotificationClient;
import com.vault.theguardian.securityhealthservice.subscription.SubscriptionClient;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

@Service
public class SecurityAlertService {
    private final NotificationClient notificationClient;
    private final SubscriptionClient subscriptionClient;

    public SecurityAlertService(
            NotificationClient notificationClient,
            SubscriptionClient subscriptionClient
    ) {
        this.notificationClient = notificationClient;
        this.subscriptionClient = subscriptionClient;
    }

    public MessageResponse recordScan(AuthenticatedUser user, SecurityAlertRequest request) {
        if (user == null || user.userId() == null) {
            throw new ResponseStatusException(
                    HttpStatus.UNAUTHORIZED,
                    "Authenticated user could not be resolved."
            );
        }

        if (!subscriptionClient.canUseBreachMonitoring(user.userId())) {
            throw new ResponseStatusException(
                    HttpStatus.FORBIDDEN,
                    "Breach monitoring is available on Premium and Family plans."
            );
        }

        notificationClient.notifySecurityScanAlert(
                user.userId(),
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
