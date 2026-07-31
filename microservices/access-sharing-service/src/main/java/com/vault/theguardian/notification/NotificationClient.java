package com.vault.theguardian.notification;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpHeaders;
import org.springframework.stereotype.Component;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;

@Component
public class NotificationClient {
    private static final Logger log = LoggerFactory.getLogger(NotificationClient.class);
    private static final String INTERNAL_KEY_HEADER = "X-Internal-Service-Key";

    private final RestClient restClient;
    private final String internalServiceKey;

    public NotificationClient(
            RestClient.Builder builder,
            @Value("${services.notification.url}") String notificationServiceUrl,
            @Value("${internal.service.key}") String internalServiceKey
    ) {
        this.restClient = builder.baseUrl(notificationServiceUrl).build();
        this.internalServiceKey = internalServiceKey;
    }

    public void notifyFamilyMemberAdded(Long userId, String memberEmail) {
        publishAfterCommit(new Request(userId, "FAMILY_MEMBER_ADDED", "Family member added",
                clean(memberEmail, "A family member") + " was added to your family vault.", "/family"));
    }

    public void notifyFamilyMemberRemoved(Long userId, String memberEmail) {
        publishAfterCommit(new Request(userId, "FAMILY_MEMBER_REMOVED", "Family member removed",
                clean(memberEmail, "A family member") + " was removed from your family vault.", "/family"));
    }

    public void notifyEmergencyContactAdded(Long userId, String contactEmail) {
        publishAfterCommit(new Request(userId, "EMERGENCY_CONTACT_ADDED", "Emergency contact added",
                clean(contactEmail, "A trusted contact") + " was added to your emergency access list.", "/emergencyaccess"));
    }

    public void notifyEmergencyContactRemoved(Long userId, String contactEmail) {
        publishAfterCommit(new Request(userId, "EMERGENCY_CONTACT_REMOVED", "Emergency contact removed",
                clean(contactEmail, "A trusted contact") + " was removed from your emergency access list.", "/emergencyaccess"));
    }

    public void notifyEmergencyAccessRequested(Long ownerId, String requesterEmail) {
        publishAfterCommit(new Request(ownerId, "EMERGENCY_ACCESS_REQUESTED", "Emergency access requested",
                clean(requesterEmail, "A trusted contact") + " requested emergency access. Approve or deny the request.",
                "/emergencyaccess"));
    }

    public void notifyEmergencyAccessApproved(Long requesterId, String ownerEmail) {
        publishAfterCommit(new Request(requesterId, "EMERGENCY_ACCESS_APPROVED", "Emergency access approved",
                clean(ownerEmail, "The vault owner") + " approved your emergency access request.", "/emergencyaccess"));
    }

    public void notifyEmergencyAccessDenied(Long requesterId, String ownerEmail) {
        publishAfterCommit(new Request(requesterId, "EMERGENCY_ACCESS_DENIED", "Emergency access denied",
                clean(ownerEmail, "The vault owner") + " denied your emergency access request.", "/emergencyaccess"));
    }

    public void notifyEmergencyAccessAvailable(Long requesterId, String ownerEmail) {
        publishAfterCommit(new Request(requesterId, "EMERGENCY_ACCESS_AVAILABLE", "Emergency access available",
                "The waiting period for " + clean(ownerEmail, "the vault owner") + " has ended.", "/emergencyaccess"));
    }

    public void notifyEmergencyVaultViewed(Long ownerId, String requesterEmail) {
        publishAfterCommit(new Request(ownerId, "EMERGENCY_VAULT_VIEWED", "Emergency vault viewed",
                clean(requesterEmail, "A trusted contact") + " opened your emergency vault.", "/emergencyaccess"));
    }

    private void publishAfterCommit(Request request) {
        if (request.userId() == null) return;

        if (TransactionSynchronizationManager.isActualTransactionActive()
                && TransactionSynchronizationManager.isSynchronizationActive()) {
            TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
                @Override
                public void afterCommit() {
                    publish(request);
                }
            });
            return;
        }

        publish(request);
    }

    private void publish(Request request) {
        try {
            restClient.post()
                    .uri("/internal/notifications")
                    .header(HttpHeaders.CONTENT_TYPE, "application/json")
                    .header(INTERNAL_KEY_HEADER, internalServiceKey)
                    .body(request)
                    .retrieve()
                    .toBodilessEntity();
        } catch (RestClientException exception) {
            log.warn("Notification Service could not receive type={} userId={}: {}",
                    request.type(), request.userId(), exception.getMessage());
        }
    }

    private String clean(String value, String fallback) {
        return value == null || value.isBlank() ? fallback : value.trim();
    }

    private record Request(
            Long userId,
            String type,
            String title,
            String message,
            String actionRoute
    ) {}
}
