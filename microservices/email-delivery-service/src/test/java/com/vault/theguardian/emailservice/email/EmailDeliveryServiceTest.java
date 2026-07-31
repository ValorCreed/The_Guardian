package com.vault.theguardian.emailservice.email;

import org.junit.jupiter.api.Test;
import org.springframework.web.client.RestClient;

import static org.junit.jupiter.api.Assertions.assertFalse;

class EmailDeliveryServiceTest {
    @Test
    void demoModeKeepsCallerFlowWhenGmailConfigurationIsMissing() {
        EmailDeliveryService service = new EmailDeliveryService(
                RestClient.builder(), "", "", "", "", true
        );

        EmailDeliveryResponse response = service.sendVerificationCode(
                "user@example.com", "123456"
        );

        assertFalse(response.sent());
    }
}
