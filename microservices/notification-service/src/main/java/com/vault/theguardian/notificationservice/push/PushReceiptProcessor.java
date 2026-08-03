package com.vault.theguardian.notificationservice.push;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;

@Service
public class PushReceiptProcessor {
    private final PushDeliveryAttemptRepository attemptRepository;
    private final PushTokenService tokenService;
    private final DatabaseClock databaseClock;

    public PushReceiptProcessor(
            PushDeliveryAttemptRepository attemptRepository,
            PushTokenService tokenService,
            DatabaseClock databaseClock
    ) {
        this.attemptRepository = attemptRepository;
        this.tokenService = tokenService;
        this.databaseClock = databaseClock;
    }

    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void apply(Long attemptId, ExpoPushGateway.ReceiptResult result) {
        PushDeliveryAttempt attempt = attemptRepository.findByIdForUpdate(attemptId)
                .orElse(null);
        if (attempt == null || attempt.getStatus() != PushDeliveryStatus.SENT) return;

        attempt.setReceiptCheckedAt(databaseClock.now());
        attempt.setUpdatedAt(databaseClock.now());

        if (result.delivered()) {
            attempt.setStatus(PushDeliveryStatus.DELIVERED);
            attempt.setErrorCode(null);
            attempt.setErrorMessage(null);
        } else {
            attempt.setStatus(PushDeliveryStatus.FAILED);
            attempt.setErrorCode(result.errorCode());
            attempt.setErrorMessage(result.errorMessage());
            if ("DeviceNotRegistered".equalsIgnoreCase(result.errorCode())) {
                tokenService.disableToken(attempt.getPushTokenId(), result.errorCode());
            }
        }

        attemptRepository.save(attempt);
    }
}
