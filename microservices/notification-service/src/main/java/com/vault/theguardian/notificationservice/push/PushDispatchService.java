package com.vault.theguardian.notificationservice.push;

import com.vault.theguardian.notificationservice.notification.AppNotification;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.List;

@Service
public class PushDispatchService {
    private final PushPolicyResolver policyResolver;
    private final PushPreferenceService preferenceService;
    private final PushTokenService pushTokenService;
    private final PushDeliveryAttemptRepository attemptRepository;
    private final DatabaseClock databaseClock;

    public PushDispatchService(
            PushPolicyResolver policyResolver,
            PushPreferenceService preferenceService,
            PushTokenService pushTokenService,
            PushDeliveryAttemptRepository attemptRepository,
            DatabaseClock databaseClock
    ) {
        this.policyResolver = policyResolver;
        this.preferenceService = preferenceService;
        this.pushTokenService = pushTokenService;
        this.attemptRepository = attemptRepository;
        this.databaseClock = databaseClock;
    }

    @Transactional
    public void queue(AppNotification notification) {
        PushPolicy policy = policyResolver.resolve(notification);
        if (!policy.push()) return;
        if (!preferenceService.allows(notification.getUserId(), policy.category())) return;

        List<PushToken> tokens = pushTokenService.activeTokens(notification.getUserId());
        LocalDateTime now = databaseClock.now();

        for (PushToken token : tokens) {
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
}
