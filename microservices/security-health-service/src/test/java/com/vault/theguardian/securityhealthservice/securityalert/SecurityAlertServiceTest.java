package com.vault.theguardian.securityhealthservice.securityalert;

import com.vault.theguardian.securityhealthservice.auth.AuthenticatedUser;
import com.vault.theguardian.securityhealthservice.common.MessageResponse;
import com.vault.theguardian.securityhealthservice.notification.NotificationClient;
import com.vault.theguardian.securityhealthservice.subscription.SubscriptionClient;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.Mockito.*;

class SecurityAlertServiceTest {
    private NotificationClient notificationClient;
    private SubscriptionClient subscriptionClient;
    private SecurityAlertService securityAlertService;

    @BeforeEach
    void setUp() {
        notificationClient = mock(NotificationClient.class);
        subscriptionClient = mock(SubscriptionClient.class);
        securityAlertService = new SecurityAlertService(notificationClient, subscriptionClient);
    }

    @Test
    void recordsScanForEntitledUser() {
        AuthenticatedUser user = new AuthenticatedUser(12L, "user@example.com");
        SecurityAlertRequest request = new SecurityAlertRequest(72, 4, 0, 2, 1, 1);
        when(subscriptionClient.canUseBreachMonitoring(12L)).thenReturn(true);

        MessageResponse response = securityAlertService.recordScan(user, request);

        assertEquals("Security scan alert recorded.", response.message());
        verify(notificationClient).notifySecurityScanAlert(12L, 72, 4, 0, 2, 1, 1);
    }

    @Test
    void rejectsUserWithoutBreachMonitoringEntitlement() {
        AuthenticatedUser user = new AuthenticatedUser(12L, "user@example.com");
        SecurityAlertRequest request = new SecurityAlertRequest(72, 4, 0, 2, 1, 1);
        when(subscriptionClient.canUseBreachMonitoring(12L)).thenReturn(false);

        ResponseStatusException exception = assertThrows(
                ResponseStatusException.class,
                () -> securityAlertService.recordScan(user, request)
        );

        assertEquals(HttpStatus.FORBIDDEN.value(), exception.getStatusCode().value());
        verifyNoInteractions(notificationClient);
    }
}
