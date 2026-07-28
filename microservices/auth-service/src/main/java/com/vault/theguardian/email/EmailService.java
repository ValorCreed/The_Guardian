package com.vault.theguardian.email;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;

import java.time.LocalDateTime;

/**
 * Drop-in replacement for the former Gmail implementation.
 * The public method signatures are preserved so AuthService does not need to change.
 */
@Service
public class EmailService {
    private static final Logger log = LoggerFactory.getLogger(EmailService.class);
    private static final String INTERNAL_KEY_HEADER = "X-Internal-Service-Key";

    private final RestClient restClient;
    private final String internalServiceKey;

    public EmailService(
            RestClient.Builder builder,
            @Value("${services.email.url:${EMAIL_SERVICE_URL:http://localhost:8091}}")
            String emailServiceUrl,
            @Value("${internal.service.key:${services.internal-key:${INTERNAL_SERVICE_KEY:change-this-local-key}}}")
            String internalServiceKey
    ) {
        this.restClient = builder.baseUrl(emailServiceUrl).build();
        this.internalServiceKey = internalServiceKey;
    }

    public boolean sendRegistrationVerificationCode(String toEmail, String code) {
        return sendCode("/internal/emails/registration-verification", toEmail, code);
    }

    public boolean sendEmailVerificationCode(String toEmail, String code) {
        return sendCode("/internal/emails/verification", toEmail, code);
    }

    public boolean sendPasswordResetCode(String toEmail, String code) {
        return sendCode("/internal/emails/password-reset", toEmail, code);
    }

    public boolean sendTwoFactorCode(String toEmail, String code) {
        return sendCode("/internal/emails/two-factor", toEmail, code);
    }

    public boolean sendBugReportNotification(
            String toEmail,
            String reporterName,
            String reporterEmail,
            Long reportId,
            String title,
            String category,
            String severity,
            String description,
            String stepsToReproduce,
            String deviceInfo,
            String appVersion,
            LocalDateTime createdAt
    ) {
        return send("/internal/emails/bug-report", new BugReportEmailRequest(
                toEmail, reporterName, reporterEmail, reportId, title, category, severity,
                description, stepsToReproduce, deviceInfo, appVersion, createdAt
        ));
    }

    private boolean sendCode(String path, String toEmail, String code) {
        return send(path, new CodeEmailRequest(toEmail, code));
    }

    private boolean send(String path, Object request) {
        try {
            EmailDeliveryResponse response = restClient.post()
                    .uri(path)
                    .header(INTERNAL_KEY_HEADER, internalServiceKey)
                    .body(request)
                    .retrieve()
                    .body(EmailDeliveryResponse.class);
            return response != null && response.sent();
        } catch (RestClientException exception) {
            // Preserve the existing non-fatal email behavior used by AuthService.
            log.warn("Email Delivery Service call failed path={}: {}", path,
                    exception.getMessage());
            return false;
        }
    }

    private record CodeEmailRequest(String toEmail, String code) {}

    private record BugReportEmailRequest(
            String toEmail,
            String reporterName,
            String reporterEmail,
            Long reportId,
            String title,
            String category,
            String severity,
            String description,
            String stepsToReproduce,
            String deviceInfo,
            String appVersion,
            LocalDateTime createdAt
    ) {}

    private record EmailDeliveryResponse(boolean sent, String message) {}
}
