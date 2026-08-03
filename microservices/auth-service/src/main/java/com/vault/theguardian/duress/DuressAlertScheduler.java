package com.vault.theguardian.duress;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.time.LocalDateTime;

@Component
public class DuressAlertScheduler {
    private static final Logger log = LoggerFactory.getLogger(DuressAlertScheduler.class);
    private final DuressService duressService;

    public DuressAlertScheduler(DuressService duressService) {
        this.duressService = duressService;
    }

    @Scheduled(fixedDelayString = "${duress.alert.scheduler-delay-ms:60000}")
    public void deliverDueAlerts() {
        LocalDateTime now = LocalDateTime.now();
        for (Long id : duressService.dueAlertIds(now)) {
            try {
                duressService.deliverDueAlert(id, now);
            } catch (Exception error) {
                log.error("Duress alert {} delivery failed; it remains retryable.", id, error);
            }
        }
    }
}
