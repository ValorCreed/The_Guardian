package com.vault.gateway.coldstart;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Component;

import java.util.UUID;

@Component
public class GatewayWarmupRunner {
    private static final Logger log = LoggerFactory.getLogger(GatewayWarmupRunner.class);

    private final DownstreamServiceRegistry registry;
    private final DownstreamWakeCoordinator wakeCoordinator;
    private final boolean prewarmAllOnStartup;

    public GatewayWarmupRunner(
            DownstreamServiceRegistry registry,
            DownstreamWakeCoordinator wakeCoordinator,
            @Value("${guardian.cold-start.prewarm-all-on-startup:false}") boolean prewarmAllOnStartup
    ) {
        this.registry = registry;
        this.wakeCoordinator = wakeCoordinator;
        this.prewarmAllOnStartup = prewarmAllOnStartup;
    }

    @EventListener(ApplicationReadyEvent.class)
    public void onApplicationReady() {
        if (!wakeCoordinator.isEnabled() || !prewarmAllOnStartup) {
            log.info(
                    "GW-PREWARM-SKIP enabled={} prewarmAllOnStartup={}",
                    wakeCoordinator.isEnabled(), prewarmAllOnStartup
            );
            return;
        }

        String startupId = "startup-" + UUID.randomUUID();
        log.info(
                "GW-PREWARM-START requestId={} serviceCount={}",
                startupId, registry.all().size()
        );

        registry.all().forEach(service ->
                wakeCoordinator.wakeAsync(service, startupId, "gateway-startup")
                        .whenComplete((result, throwable) -> {
                            if (throwable != null) {
                                log.error(
                                        "GW-PREWARM-RESULT requestId={} service={} ready=false errorType={} message={}",
                                        startupId, service.name(), throwable.getClass().getSimpleName(),
                                        String.valueOf(throwable.getMessage())
                                );
                                return;
                            }

                            log.info(
                                    "GW-PREWARM-RESULT requestId={} service={} ready={} status={} attempts={} elapsedMs={} detail={}",
                                    startupId, service.name(), result.ready(), result.lastStatus(),
                                    result.attempts(), result.elapsedMs(), result.detail()
                            );
                        })
        );
    }
}
