package com.vault.theguardian.notificationservice.push;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;

@Service
public class PushDeliveryProcessor {
    private static final Logger log = LoggerFactory.getLogger(PushDeliveryProcessor.class);
    private static final int MAX_ATTEMPTS = 4;

    private final PushDeliveryAttemptRepository attemptRepository;
    private final PushTokenRepository tokenRepository;
    private final PushTokenService tokenService;
    private final ExpoPushGateway gateway;
    private final DatabaseClock databaseClock;

    public PushDeliveryProcessor(
            PushDeliveryAttemptRepository attemptRepository,
            PushTokenRepository tokenRepository,
            PushTokenService tokenService,
            ExpoPushGateway gateway,
            DatabaseClock databaseClock
    ) {
        this.attemptRepository = attemptRepository;
        this.tokenRepository = tokenRepository;
        this.tokenService = tokenService;
        this.gateway = gateway;
        this.databaseClock = databaseClock;
    }

    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void send(Long attemptId) {
        PushDeliveryAttempt attempt = attemptRepository.findByIdForUpdate(attemptId)
                .orElse(null);
        if (attempt == null) return;
        if (attempt.getStatus() != PushDeliveryStatus.QUEUED
                && attempt.getStatus() != PushDeliveryStatus.RETRY) {
            return;
        }

        PushToken token = tokenRepository.findById(attempt.getPushTokenId()).orElse(null);
        if (token == null || !token.isEnabled()) {
            fail(attempt, "TOKEN_DISABLED", "Push token is no longer active.");
            return;
        }

        attempt.setAttemptCount(attempt.getAttemptCount() + 1);
        attempt.setUpdatedAt(databaseClock.now());

        try {
            ExpoPushGateway.TicketResult result = gateway.send(token, attempt);
            if (result.accepted()) {
                attempt.setStatus(PushDeliveryStatus.SENT);
                attempt.setExpoTicketId(result.ticketId());
                attempt.setSentAt(databaseClock.now());
                attempt.setErrorCode(null);
                attempt.setErrorMessage(null);
                attempt.setNextAttemptAt(databaseClock.now().plusMinutes(30));
            } else if ("DeviceNotRegistered".equalsIgnoreCase(result.errorCode())) {
                tokenService.disableToken(token.getId(), result.errorCode());
                fail(attempt, result.errorCode(), result.errorMessage());
            } else {
                retryOrFail(attempt, result.errorCode(), result.errorMessage());
            }
        } catch (Exception exception) {
            retryOrFail(attempt, "EXPO_TRANSPORT_ERROR", exception.getMessage());
        }

        attemptRepository.save(attempt);
    }

    private void retryOrFail(
            PushDeliveryAttempt attempt,
            String code,
            String message
    ) {
        if (attempt.getAttemptCount() >= MAX_ATTEMPTS) {
            fail(attempt, code, message);
            return;
        }

        long delaySeconds = Math.min(
                300,
                10L * (1L << Math.max(0, attempt.getAttemptCount() - 1))
        );
        attempt.setStatus(PushDeliveryStatus.RETRY);
        attempt.setErrorCode(code);
        attempt.setErrorMessage(clean(message));
        attempt.setNextAttemptAt(databaseClock.now().plusSeconds(delaySeconds));
        log.warn(
                "Push delivery will retry: attemptId={}, attempt={}, code={}",
                attempt.getId(),
                attempt.getAttemptCount(),
                code
        );
    }

    private void fail(
            PushDeliveryAttempt attempt,
            String code,
            String message
    ) {
        attempt.setStatus(PushDeliveryStatus.FAILED);
        attempt.setErrorCode(code);
        attempt.setErrorMessage(clean(message));
        attempt.setNextAttemptAt(databaseClock.now().plusYears(10));
    }

    private String clean(String value) {
        if (value == null || value.isBlank()) return "Push delivery failed.";
        String clean = value.trim();
        return clean.length() <= 1200 ? clean : clean.substring(0, 1200);
    }
}
