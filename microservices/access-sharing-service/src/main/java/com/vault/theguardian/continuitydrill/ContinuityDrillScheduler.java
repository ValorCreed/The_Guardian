package com.vault.theguardian.continuitydrill;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.time.Instant;

@Component
public class ContinuityDrillScheduler {
    private static final Logger log = LoggerFactory.getLogger(ContinuityDrillScheduler.class);

    private final ContinuityDrillService service;

    public ContinuityDrillScheduler(ContinuityDrillService service) {
        this.service = service;
    }

    @Scheduled(
            initialDelayString = "${guardian.continuity-drill.initial-delay-ms:45000}",
            fixedDelayString = "${guardian.continuity-drill.scan-interval-ms:300000}"
    )
    public void expireOverdueDrills() {
        Instant now = Instant.now();
        try {
            for (Long drillId : service.findExpiredDrillIds(now)) {
                try {
                    service.expire(drillId, Instant.now());
                } catch (Exception exception) {
                    log.error("Continuity Drill expiry failed for id={}", drillId, exception);
                }
            }
        } catch (Exception exception) {
            log.error("Continuity Drill expiry scan failed.", exception);
        }
    }
}
