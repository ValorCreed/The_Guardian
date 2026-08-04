package com.vault.theguardian.notificationservice.push;

import com.vault.theguardian.notificationservice.notification.AppNotification;
import com.vault.theguardian.notificationservice.notification.NotificationRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.List;

@Service
public class PushDispatchService {
    private final PushPolicyResolver policyResolver;
    private final PushPreferenceService preferenceService;
    private final PushTokenRepository pushTokenRepository;
    private final PushDeliveryAttemptRepository attemptRepository;
    private final NotificationRepository notificationRepository;
    private final DatabaseClock databaseClock;

    public PushDispatchService(
            PushPolicyResolver policyResolver,
            PushPreferenceService preferenceService,
            PushTokenRepository pushTokenRepository,
            PushDeliveryAttemptRepository attemptRepository,
            NotificationRepository notificationRepository,
            DatabaseClock databaseClock
    ) {
        this.policyResolver = policyResolver;
        this.preferenceService = preferenceService;
        this.pushTokenRepository = pushTokenRepository;
        this.attemptRepository = attemptRepository;
        this.notificationRepository = notificationRepository;
        this.databaseClock = databaseClock;
    }

    @Transactional
    public void queue(AppNotification notification) {
        if (notification == null || notification.getId() == null) return;

        List<PushToken> tokens = pushTokenRepository
                .findByUserIdAndEnabledTrue(notification.getUserId());

        for (PushToken token : tokens) {
            queueForToken(notification, token);
        }
    }

    /**
     * Queues recent events for a token that was registered immediately after
     * sign-in. This closes the short window where the login event can be
     * created before the device has reattached its Expo push token.
     */
    @Transactional
    public void queueRecentForToken(
            Long userId,
            Long tokenId,
            LocalDateTime createdAfter
    ) {
        if (userId == null || tokenId == null || createdAfter == null) return;

        PushToken token = pushTokenRepository.findById(tokenId).orElse(null);
        if (token == null || !token.isEnabled() || !userId.equals(token.getUserId())) {
            return;
        }

        List<AppNotification> recent = notificationRepository
                .findTop20ByUserIdAndCreatedAtGreaterThanEqualOrderByCreatedAtDesc(
                        userId,
                        createdAfter
                );

        for (AppNotification notification : recent) {
            queueForToken(notification, token);
        }
    }

    private void queueForToken(AppNotification notification, PushToken token) {
        if (notification == null || notification.getId() == null) return;
        if (token == null || token.getId() == null || !token.isEnabled()) return;
        if (!notification.getUserId().equals(token.getUserId())) return;

        PushPolicy policy = policyResolver.resolve(notification);
        if (!policy.push()) return;
        if (!preferenceService.allows(notification.getUserId(), policy.category())) return;

        if (attemptRepository.existsByNotificationIdAndPushTokenId(
                notification.getId(),
                token.getId()
        )) {
            return;
        }

        LocalDateTime now = databaseClock.now();
        PushDeliveryAttempt attempt = PushDeliveryAttempt.builder()
                .notificationId(notification.getId())
                .pushTokenId(token.getId())
                .status(PushDeliveryStatus.QUEUED)
                .urgency(policy.urgency())
                .channelId(policy.channelId())
                .pushTitle(policy.title())
                .pushBody(policy.body())
                .actionRoute(notification.getActionRoute())
                .notificationType(notification.getType().name())
                .attemptCount(0)
                .nextAttemptAt(now)
                .createdAt(now)
                .updatedAt(now)
                .build();
        attemptRepository.save(attempt);
    }
}
