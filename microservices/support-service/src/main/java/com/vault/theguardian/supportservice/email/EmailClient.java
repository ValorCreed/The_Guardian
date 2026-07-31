package com.vault.theguardian.supportservice.email;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;

@Component
public class EmailClient {
    private static final Logger log = LoggerFactory.getLogger(EmailClient.class);
    private static final String INTERNAL_KEY_HEADER = "X-Internal-Service-Key";

    private final RestClient restClient;
    private final String internalServiceKey;

    public EmailClient(
            RestClient.Builder builder,
            @Value("${services.email.url}") String emailServiceUrl,
            @Value("${internal.service.key}") String internalServiceKey
    ) {
        this.restClient = builder.baseUrl(emailServiceUrl).build();
        this.internalServiceKey = internalServiceKey;
    }

    public boolean sendBugReport(BugReportEmailRequest request) {
        try {
            EmailDeliveryResponse response = restClient.post()
                    .uri("/internal/emails/bug-report")
                    .header(INTERNAL_KEY_HEADER, internalServiceKey)
                    .body(request)
                    .retrieve()
                    .body(EmailDeliveryResponse.class);

            return response != null && response.sent();
        } catch (RestClientException exception) {
            // The report is already stored. Email delivery must not undo that transaction.
            log.warn("Email Delivery Service could not send bug report #{}: {}",
                    request.reportId(), exception.getMessage());
            return false;
        }
    }
}
