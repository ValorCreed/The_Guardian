package com.vault.theguardian.notificationservice.push;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;

import java.time.LocalDateTime;
import java.util.List;

@Service
public class PushTokenService {
    private static final Logger log = LoggerFactory.getLogger(PushTokenService.class);
    private static final long RECENT_NOTIFICATION_LOOKBACK_MINUTES = 5L;

    private final PushTokenRepository repository;
    private final PushPreferenceService preferenceService;
    private final PushDispatchService pushDispatchService;
    private final DatabaseClock databaseClock;

    public PushTokenService(
            PushTokenRepository repository,
            PushPreferenceService preferenceService,
            PushDispatchService pushDispatchService,
            DatabaseClock databaseClock
    ) {
        this.repository = repository;
        this.preferenceService = preferenceService;
        this.pushDispatchService = pushDispatchService;
        this.databaseClock = databaseClock;
    }

    @Transactional
    public PushTokenResponse register(Long userId, RegisterPushTokenRequest request) {
        String tokenValue = request.expoPushToken().trim();
        String installationId = request.installationId().trim();
        LocalDateTime now = databaseClock.now();

        var tokenMatch = repository.findByExpoPushToken(tokenValue);
        var installationMatch =
                repository.findByUserIdAndInstallationId(userId, installationId);

        /*
         * A physical installation can move from one Guardian account to
         * another after logout. If the Expo token row and installation row are
         * different records, keeping both would violate one of the unique
         * constraints during reassignment.
         */
        if (tokenMatch.isPresent()
                && installationMatch.isPresent()
                && !tokenMatch.get().getId().equals(installationMatch.get().getId())) {
            repository.delete(installationMatch.get());
            repository.flush();
            installationMatch = java.util.Optional.empty();
        }

        PushToken token;
        if (tokenMatch.isPresent()) {
            token = tokenMatch.get();
        } else if (installationMatch.isPresent()) {
            token = installationMatch.get();
        } else {
            token = new PushToken();
        }

        token.setUserId(userId);
        token.setInstallationId(installationId);
        token.setExpoPushToken(tokenValue);
        token.setPlatform(request.platform().trim().toLowerCase());
        token.setDeviceName(request.deviceName().trim());
        token.setAppVersion(clean(request.appVersion()));
        token.setEnabled(true);
        token.setUpdatedAt(now);
        token.setLastSeenAt(now);
        if (token.getCreatedAt() == null) token.setCreatedAt(now);

        PushToken saved = repository.saveAndFlush(token);
        preferenceService.setPushEnabled(userId, true);

        queueRecentNotificationsAfterCommit(
                userId,
                saved.getId(),
                now.minusMinutes(RECENT_NOTIFICATION_LOOKBACK_MINUTES)
        );

        return toResponse(saved);
    }

    private void queueRecentNotificationsAfterCommit(
            Long userId,
            Long tokenId,
            LocalDateTime createdAfter
    ) {
        Runnable catchUp = () -> {
            try {
                pushDispatchService.queueRecentForToken(userId, tokenId, createdAfter);
            } catch (RuntimeException error) {
                /* Push catch-up must never roll back or fail token registration. */
                log.warn(
                        "Could not queue recent push notifications after token registration userId={} tokenId={}: {}",
                        userId,
                        tokenId,
                        error.getMessage()
                );
            }
        };

        if (TransactionSynchronizationManager.isActualTransactionActive()
                && TransactionSynchronizationManager.isSynchronizationActive()) {
            TransactionSynchronizationManager.registerSynchronization(
                    new TransactionSynchronization() {
                        @Override
                        public void afterCommit() {
                            catchUp.run();
                        }
                    }
            );
            return;
        }

        catchUp.run();
    }

    @Transactional
    public void unregister(Long userId, String installationId) {
        if (installationId == null || installationId.isBlank()) return;
        repository.findByUserIdAndInstallationId(userId, installationId.trim())
                .ifPresent(token -> {
                    token.setEnabled(false);
                    token.setUpdatedAt(databaseClock.now());
                    repository.save(token);
                });
    }

    @Transactional(readOnly = true)
    public List<PushToken> activeTokens(Long userId) {
        return repository.findByUserIdAndEnabledTrue(userId);
    }

    @Transactional
    public void disableToken(Long tokenId, String reason) {
        repository.findById(tokenId).ifPresent(token -> {
            token.setEnabled(false);
            token.setUpdatedAt(databaseClock.now());
            repository.save(token);
        });
    }

    @Transactional
    public void deleteForUser(Long userId) {
        repository.deleteByUserId(userId);
    }

    private PushTokenResponse toResponse(PushToken token) {
        return new PushTokenResponse(
                token.isEnabled(),
                token.getInstallationId(),
                token.getPlatform(),
                token.getDeviceName(),
                token.getLastSeenAt()
        );
    }

    private String clean(String value) {
        return value == null || value.isBlank() ? null : value.trim();
    }
}
