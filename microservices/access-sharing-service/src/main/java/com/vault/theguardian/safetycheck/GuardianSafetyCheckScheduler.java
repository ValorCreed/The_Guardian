package com.vault.theguardian.safetycheck;

import java.time.Instant;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

@Component
public class GuardianSafetyCheckScheduler {
    private static final Logger log = LoggerFactory.getLogger(GuardianSafetyCheckScheduler.class);

    private final GuardianSafetyCheckService safetyCheckService;

    public GuardianSafetyCheckScheduler(GuardianSafetyCheckService safetyCheckService) {
        this.safetyCheckService = safetyCheckService;
    }

    @Scheduled(
            initialDelayString = "${guardian.safety-check.initial-delay-ms:30000}",
            fixedDelayString = "${guardian.safety-check.scan-interval-ms:60000}"
    )
    public void processSafetyChecks() {
        Instant scanTime = Instant.now();

        try {
            for (Long safetyCheckId : safetyCheckService.findDueSafetyCheckIds(scanTime)) {
                try {
                    safetyCheckService.processDueSafetyCheck(safetyCheckId, Instant.now());
                } catch (Exception exception) {
                    log.error(
                            "Guardian Safety Check processing failed for id={}.",
                            safetyCheckId,
                            exception
                    );
                }
            }
        } catch (Exception exception) {
            log.error("Guardian Safety Check scan failed.", exception);
        }
    }
}
