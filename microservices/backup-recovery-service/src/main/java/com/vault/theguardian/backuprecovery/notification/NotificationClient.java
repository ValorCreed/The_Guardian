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
