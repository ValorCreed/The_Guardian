package com.vault.theguardian.backuprecovery.notification;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
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

    public void notifyBackupCreated(Long userId, int totalItemCount) {
        publishAfterCommit(new Request(
                userId,
                "BACKUP_CREATED",
                "Backup created",
                "Your encrypted vault backup was created successfully with "
                        + totalItemCount + " item(s).",
                "/backup"
        ));
    }

    public void notifyBackupRestored(Long userId, int totalRestoredCount, boolean replaceExisting) {
        String mode = replaceExisting
                ? "replaced your current vault"
                : "was merged with your current vault";
        publishAfterCommit(new Request(
                userId,
                "BACKUP_RESTORED",
                "Backup restored",
                "Your backup " + mode + ". " + totalRestoredCount + " item(s) were restored.",
                "/backup"
        ));
    }

    public void notifyRecoveryKitCreated(Long userId) {
        publishAfterCommit(new Request(
                userId,
                "RECOVERY_KIT_CREATED",
                "Recovery kit generated",
                "A new recovery kit was generated for your account. Keep it offline and private.",
                "/recoverykit"
        ));
    }

    public void notifyRecoveryKitUsed(Long userId) {
        publishAfterCommit(new Request(
                userId,
                "RECOVERY_KIT_USED",
                "Recovery kit used",
                "Your recovery kit was used to reset your account password. If this was not you, secure your account immediately.",
                "/security"
        ));
    }

    public void notifyRecoveryKitRevoked(Long userId) {
        publishAfterCommit(new Request(
                userId,
                "RECOVERY_KIT_REVOKED",
                "Recovery kit revoked",
                "Your active recovery kit was revoked. Generate a new one if you want account recovery protection.",
                "/recoverykit"
        ));
    }

    public void notifyAccountResetVaultErased(Long userId) {
        publishAfterCommit(new Request(
                userId,
                "ACCOUNT_RESET_VAULT_ERASED",
                "Account reset completed",
                "Your password was reset without a recovery kit, so your old vault data was permanently erased and trusted devices were logged out.",
                "/recoverykit"
        ));
    }


    public void notifyRecoveryCircleConfigured(Long userId, int threshold, int memberCount) {
        publishAfterCommit(new Request(
                userId,
                "RECOVERY_CIRCLE_CONFIGURED",
                "Recovery Circle active",
                "Your Recovery Circle now requires " + threshold + " of " + memberCount
                        + " trusted contacts to approve account recovery.",
                "/recoverycircle"
        ));
    }

    public void notifyRecoveryCircleDisabled(Long userId) {
        publishAfterCommit(new Request(
                userId,
                "RECOVERY_CIRCLE_DISABLED",
                "Recovery Circle disabled",
                "Recovery Circle protection was disabled for your account.",
                "/recoverycircle"
        ));
    }

    public void notifyRecoveryCircleMemberAdded(Long userId, String ownerEmail) {
        publishAfterCommit(new Request(
                userId,
                "RECOVERY_CIRCLE_MEMBER_ADDED",
                "You joined a Recovery Circle",
                ownerEmail + " selected you as a trusted Recovery Circle member.",
                "/recoverycircle"
        ));
    }

    public void notifyRecoveryCircleApprovalRequested(
            Long userId,
            String ownerName,
            String requestId
    ) {
        publishAfterCommit(new Request(
                userId,
                "RECOVERY_CIRCLE_APPROVAL_REQUESTED",
                "Recovery approval requested",
                ownerName + " started account recovery. Verify their identity outside Guardian before approving request "
                        + requestId + ".",
                "/recoverycircle"
        ));
    }

    public void notifyRecoveryCircleRequestStarted(Long userId) {
        publishAfterCommit(new Request(
                userId,
                "RECOVERY_CIRCLE_REQUEST_STARTED",
                "Recovery Circle request started",
                "A Recovery Circle request was started for your account. If this was not you, sign in and cancel it immediately.",
                "/recoverycircle"
        ));
    }

    public void notifyRecoveryCircleVoteProgress(Long userId, int approvals, int threshold) {
        publishAfterCommit(new Request(
                userId,
                "RECOVERY_CIRCLE_VOTE_RECORDED",
                "Recovery approval recorded",
                approvals + " of " + threshold + " required approvals have been received.",
                "/recoverycircle"
        ));
    }

    public void notifyRecoveryCircleThresholdReached(Long userId) {
        publishAfterCommit(new Request(
                userId,
                "RECOVERY_CIRCLE_APPROVED",
                "Recovery Circle approved",
                "Your trusted contacts reached the approval threshold. The recovery request can now reset the account password.",
                "/recoverycircle"
        ));
    }

    public void notifyRecoveryCircleRequestDenied(Long userId) {
        publishAfterCommit(new Request(
                userId,
                "RECOVERY_CIRCLE_DENIED",
                "Recovery Circle request denied",
                "The request can no longer reach the required approval threshold.",
                "/recoverycircle"
        ));
    }

    public void notifyRecoveryCircleRequestCancelled(Long userId) {
        notifyRecoveryCircleRequestCancelled(userId, "The active Recovery Circle request was cancelled.");
    }

    public void notifyRecoveryCircleRequestCancelled(Long userId, String message) {
        publishAfterCommit(new Request(
                userId,
                "RECOVERY_CIRCLE_CANCELLED",
                "Recovery Circle request cancelled",
                message,
                "/recoverycircle"
        ));
    }

    public void notifyRecoveryCircleCompleted(Long userId) {
        publishAfterCommit(new Request(
                userId,
                "RECOVERY_CIRCLE_COMPLETED",
                "Recovery Circle completed",
                "Your password was reset through Recovery Circle. Existing sessions, biometric credentials, and recovery kits were revoked.",
                "/security"
        ));
    }

    public void notifyRecoveryCircleCompletedForMember(Long userId, String requestId) {
        publishAfterCommit(new Request(
                userId,
                "RECOVERY_CIRCLE_COMPLETED",
                "Recovery completed",
                "Recovery Circle request " + requestId + " was completed.",
                "/recoverycircle"
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
                    .header(INTERNAL_KEY_HEADER, internalServiceKey)
                    .body(request)
                    .retrieve()
                    .toBodilessEntity();
        } catch (RestClientException exception) {
            log.warn(
                    "Notification Service could not receive type={} userId={}: {}",
                    request.type(), request.userId(), exception.getMessage()
            );
        }
    }

    private record Request(
            Long userId,
            String type,
            String title,
            String message,
            String actionRoute
    ) {}
}
