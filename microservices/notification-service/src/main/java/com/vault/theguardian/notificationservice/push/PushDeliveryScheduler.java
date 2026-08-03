package com.vault.theguardian.notificationservice.push;

import org.springframework.data.domain.PageRequest;
import org.springframework.scheduling.annotation.Scheduled;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

import java.time.LocalDateTime;
import java.util.EnumSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

@Component
public class PushDeliveryScheduler {
    private static final Logger log = LoggerFactory.getLogger(PushDeliveryScheduler.class);
    private final PushDeliveryAttemptRepository attemptRepository;
    private final PushDeliveryProcessor deliveryProcessor;
    private final PushReceiptProcessor receiptProcessor;
    private final ExpoPushGateway gateway;
    private final DatabaseClock databaseClock;

    public PushDeliveryScheduler(
            PushDeliveryAttemptRepository attemptRepository,
            PushDeliveryProcessor deliveryProcessor,
            PushReceiptProcessor receiptProcessor,
            ExpoPushGateway gateway,
            DatabaseClock databaseClock
    ) {
        this.attemptRepository = attemptRepository;
        this.deliveryProcessor = deliveryProcessor;
        this.receiptProcessor = receiptProcessor;
        this.gateway = gateway;
        this.databaseClock = databaseClock;
    }

    @Scheduled(fixedDelayString = "${push.dispatch.delay-ms:5000}")
    public void sendDue() {
        List<Long> ids = attemptRepository.findDueIds(
                EnumSet.of(PushDeliveryStatus.QUEUED, PushDeliveryStatus.RETRY),
                databaseClock.now(),
                PageRequest.of(0, 100)
        );
        ids.forEach(deliveryProcessor::send);
    }

    @Scheduled(fixedDelayString = "${push.receipts.delay-ms:60000}")
    public void checkReceipts() {
        List<Long> ids = attemptRepository.findReceiptDueIds(
                PushDeliveryStatus.SENT,
                databaseClock.now().minusMinutes(15),
                PageRequest.of(0, 100)
        );
        if (ids.isEmpty()) return;

        Map<String, Long> attemptByTicket = new LinkedHashMap<>();
        for (Long id : ids) {
            attemptRepository.findById(id).ifPresent(attempt -> {
                if (attempt.getExpoTicketId() != null) {
                    attemptByTicket.put(attempt.getExpoTicketId(), attempt.getId());
                }
            });
        }
        if (attemptByTicket.isEmpty()) return;

        try {
            Map<String, ExpoPushGateway.ReceiptResult> receipts =
                    gateway.receipts(List.copyOf(attemptByTicket.keySet()));

            receipts.forEach((ticketId, result) -> {
                Long attemptId = attemptByTicket.get(ticketId);
                if (attemptId != null) receiptProcessor.apply(attemptId, result);
            });
        } catch (Exception exception) {
            /*
             * A temporary Expo outage must not terminate Spring's scheduler.
             * Unchecked receipts remain SENT and are retried on the next run.
             */
            log.warn("Could not retrieve Expo push receipts.", exception);
        }
    }
}
