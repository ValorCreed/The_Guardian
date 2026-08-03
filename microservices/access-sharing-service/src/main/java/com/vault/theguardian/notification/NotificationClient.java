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


    public void notifySafetyCheckConfigured(
            Long ownerId,
            String contactEmail,
            int intervalDays
    ) {
        publishAfterCommit(new Request(
                ownerId,
                "SAFETY_CHECK_CONFIGURED",
                "Guardian Safety Check active",
                "Check in every " + intervalDays + (intervalDays == 1 ? " day. " : " days. ")
                        + clean(contactEmail, "Your trusted contact")
                        + " will receive only the emergency categories and estate playbook items you approved if the grace period ends.",
                "/safetycheck"
        ));
    }

    public void notifySafetyCheckCompleted(Long ownerId) {
        publishAfterCommit(new Request(
                ownerId,
                "SAFETY_CHECK_COMPLETED",
                "Safety check-in complete",
                "Your Guardian Safety Check timer was reset. Your next check-in is scheduled.",
                "/safetycheck"
        ));
    }

    public void notifySafetyCheckGraceStarted(
            Long ownerId,
            String contactEmail,
            int gracePeriodHours
    ) {
        publishAfterCommit(new Request(
                ownerId,
                "SAFETY_CHECK_GRACE_STARTED",
                "Safety Check needs attention",
                "You missed a scheduled check-in. Check in within "
                        + gracePeriodHours + (gracePeriodHours == 1 ? " hour" : " hours")
                        + " to prevent release to "
                        + clean(contactEmail, "your trusted contact") + ".",
                "/safetycheck"
        ));
    }

    public void notifySafetyCheckTriggeredOwner(Long ownerId, String contactEmail) {
        publishAfterCommit(new Request(
                ownerId,
                "SAFETY_CHECK_TRIGGERED",
                "Safety Check information released",
                "Guardian Safety Check released the emergency information you approved to "
                        + clean(contactEmail, "your trusted contact") + ".",
                "/safetycheck"
        ));
    }

    public void notifySafetyCheckTriggeredContact(
            Long contactUserId,
            String ownerEmail,
            boolean emergencyVaultAvailable
    ) {
        publishAfterCommit(new Request(
                contactUserId,
                "SAFETY_CHECK_TRIGGERED",
                "Safety Check information is available",
                clean(ownerEmail, "A vault owner")
                        + " missed their Guardian Safety Check and grace period. "
                        + "Their approved emergency information is now available.",
                emergencyVaultAvailable
                        ? "/emergencyaccess"
                        : "/estateplaybooks?tab=received"
        ));
    }

    public void notifySafetyCheckDisabled(Long ownerId) {
        publishAfterCommit(new Request(
                ownerId,
                "SAFETY_CHECK_DISABLED",
                "Guardian Safety Check disabled",
                "Periodic safety check-ins and automatic emergency release are now off.",
                "/safetycheck"
        ));
    }

    public void notifySafetyCheckDisabledByContact(Long ownerId) {
        publishAfterCommit(new Request(
                ownerId,
                "SAFETY_CHECK_DISABLED",
                "Safety Check needs a new contact",
                "Guardian Safety Check was disabled because the selected emergency contact is no longer eligible.",
                "/safetycheck"
        ));
    }

    public void notifyEstatePlaybookCreated(Long ownerId, String itemTitle, String actionType) {
        publishAfterCommit(new Request(
                ownerId,
                "ESTATE_PLAYBOOK_CREATED",
                "Estate playbook created",
                clean(itemTitle, "A vault item") + " now has a "
                        + clean(actionType, "digital estate").toLowerCase()
                        + " playbook.",
                "/estateplaybooks"
        ));
    }

    public void notifyEstatePlaybookUpdated(Long ownerId, String itemTitle) {
        publishAfterCommit(new Request(
                ownerId,
                "ESTATE_PLAYBOOK_UPDATED",
                "Estate playbook updated",
                "The instructions for " + clean(itemTitle, "a vault item") + " were updated.",
                "/estateplaybooks"
        ));
    }

    public void notifyEstatePlaybookArchived(Long ownerId, String itemTitle) {
        publishAfterCommit(new Request(
                ownerId,
                "ESTATE_PLAYBOOK_ARCHIVED",
                "Estate playbook archived",
                clean(itemTitle, "A vault item") + " is no longer part of your active estate plan.",
                "/estateplaybooks"
        ));
    }

    public void notifyEstatePlaybookReleased(
            Long recipientUserId,
            String itemTitle,
            String actionLabel
    ) {
        publishAfterCommit(new Request(
                recipientUserId,
                "ESTATE_PLAYBOOK_RELEASED",
                "Digital estate instructions released",
                "A trusted owner released " + clean(actionLabel, "estate instructions")
                        + " for " + clean(itemTitle, "a vault item") + ".",
                "/estateplaybooks?tab=received"
        ));
    }

    public void notifyEstatePlaybookReleasedOwner(
            Long ownerId,
            String recipientEmail,
            String itemTitle
    ) {
        publishAfterCommit(new Request(
                ownerId,
                "ESTATE_PLAYBOOK_RELEASED",
                "Estate playbook released",
                clean(itemTitle, "A vault item") + " was released to "
                        + clean(recipientEmail, "your trusted recipient") + ".",
                "/estateplaybooks"
        ));
    }

    public void notifyEstatePlaybookViewed(
            Long ownerId,
            String recipientEmail,
            String itemTitle
    ) {
        publishAfterCommit(new Request(
                ownerId,
                "ESTATE_PLAYBOOK_VIEWED",
                "Estate playbook opened",
                clean(recipientEmail, "Your trusted recipient") + " opened the released item and instructions for "
                        + clean(itemTitle, "a vault item") + ".",
                "/estateplaybooks"
        ));
    }

    public void notifyEstatePlaybookCompleted(
            Long ownerId,
            String recipientEmail,
            String itemTitle
    ) {
        publishAfterCommit(new Request(
                ownerId,
                "ESTATE_PLAYBOOK_COMPLETED",
                "Estate task marked complete",
                clean(recipientEmail, "Your trusted recipient") + " marked the playbook for "
                        + clean(itemTitle, "a vault item") + " as completed.",
                "/estateplaybooks"
        ));
    }

    public void notifyEstatePlaybookCancelled(Long recipientUserId, String itemTitle) {
        publishAfterCommit(new Request(
                recipientUserId,
                "ESTATE_PLAYBOOK_CANCELLED",
                "Estate playbook cancelled",
                "The owner cancelled the unrevealed playbook for "
                        + clean(itemTitle, "a vault item") + ".",
                "/estateplaybooks?tab=received"
        ));
    }

    public void notifyContinuityDrillStarted(Long ownerId, int participantCount, java.time.Instant expiresAt) {
        publishAfterCommit(new Request(
                ownerId,
                "CONTINUITY_DRILL_STARTED",
                "Continuity Drill started",
                "Guardian sent a simulated notice to " + participantCount
                        + (participantCount == 1 ? " trusted contact. " : " trusted contacts. ")
                        + "No vault secret was released. The drill closes in 48 hours.",
                "/continuitydrill"
        ));
    }

    public void notifyContinuityDrillAcknowledgementRequested(
            Long participantUserId,
            String ownerName,
            String roles
    ) {
        publishAfterCommit(new Request(
                participantUserId,
                "CONTINUITY_DRILL_ACK_REQUESTED",
                "Continuity Drill check",
                clean(ownerName, "A trusted Guardian user")
                        + " is testing their digital continuity plan. Confirm that you received this simulated notice. "
                        + "Role: " + clean(roles, "Trusted contact") + ". No secret was released.",
                "/continuitydrill?tab=requests"
        ));
    }

    public void notifyContinuityDrillAcknowledged(Long ownerId, String participantName) {
        publishAfterCommit(new Request(
                ownerId,
                "CONTINUITY_DRILL_ACKNOWLEDGED",
                "Drill notice acknowledged",
                clean(participantName, "A trusted contact")
                        + " confirmed receipt of your simulated Continuity Drill notice.",
                "/continuitydrill"
        ));
    }

    public void notifyContinuityDrillCompleted(Long ownerId, int score) {
        publishAfterCommit(new Request(
                ownerId,
                "CONTINUITY_DRILL_COMPLETED",
                "Continuity Drill complete",
                "Your continuity readiness score is " + score
                        + "/100. Review failed checks and repair weak recovery paths.",
                "/continuitydrill"
        ));
    }

    public void notifyContinuityDrillExpired(Long ownerId, int score) {
        publishAfterCommit(new Request(
                ownerId,
                "CONTINUITY_DRILL_EXPIRED",
                "Continuity Drill expired",
                "The 48-hour drill window ended with a readiness score of " + score + "/100.",
                "/continuitydrill"
        ));
    }

    public void notifyContinuityDrillCancelled(Long ownerId) {
        publishAfterCommit(new Request(
                ownerId,
                "CONTINUITY_DRILL_CANCELLED",
                "Continuity Drill cancelled",
                "The simulated drill was cancelled. No vault secret was released.",
                "/continuitydrill"
        ));
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
