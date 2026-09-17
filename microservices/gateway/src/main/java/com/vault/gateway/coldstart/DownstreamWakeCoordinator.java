package com.vault.gateway.coldstart;

import jakarta.annotation.PreDestroy;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.time.Instant;
import java.time.ZonedDateTime;
import java.time.format.DateTimeFormatter;
import tools.jackson.databind.json.JsonMapper;
import java.util.Map;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.ThreadLocalRandom;
import java.util.concurrent.TimeUnit;

@Component
public class DownstreamWakeCoordinator {
    private static final Logger log = LoggerFactory.getLogger(DownstreamWakeCoordinator.class);
    private static final String WAKE_USER_AGENT = "Guardian-Gateway-ColdStart/1.0";

    public record WakeResult(
            boolean ready,
            int lastStatus,
            int attempts,
            long elapsedMs,
            String detail
    ) {
    }

    private static final JsonMapper JSON = JsonMapper.builder().build();
    private final Map<String, WakeResult> recentFailures = new ConcurrentHashMap<>();
    private final Map<String, Instant> retryNotBefore = new ConcurrentHashMap<>();
    private final HttpClient httpClient;
    private final ExecutorService executor;
    private final Map<String, CompletableFuture<WakeResult>> inFlight = new ConcurrentHashMap<>();
    private final Map<String, Instant> readyUntil = new ConcurrentHashMap<>();

    private final boolean enabled;
    private final long readyTtlMs;
    private final long maxWaitMs;
    private final long probeTimeoutMs;
    private final long initialBackoffMs;
    private final long maxBackoffMs;

    public DownstreamWakeCoordinator(
            @Value("${guardian.cold-start.enabled:true}") boolean enabled,
            @Value("${guardian.cold-start.ready-ttl-ms:60000}") long readyTtlMs,
            @Value("${guardian.cold-start.max-wait-ms:180000}") long maxWaitMs,
            @Value("${guardian.cold-start.probe-timeout-ms:70000}") long probeTimeoutMs,
            @Value("${guardian.cold-start.connect-timeout-ms:10000}") long connectTimeoutMs,
            @Value("${guardian.cold-start.initial-backoff-ms:5000}") long initialBackoffMs,
            @Value("${guardian.cold-start.max-backoff-ms:15000}") long maxBackoffMs
    ) {
        this.enabled = enabled;
        this.readyTtlMs = Math.max(1_000L, readyTtlMs);
        this.maxWaitMs = Math.max(10_000L, maxWaitMs);
        this.probeTimeoutMs = Math.max(1_000L, probeTimeoutMs);
        this.initialBackoffMs = Math.max(250L, initialBackoffMs);
        this.maxBackoffMs = Math.max(this.initialBackoffMs, maxBackoffMs);
        this.executor = Executors.newVirtualThreadPerTaskExecutor();
        this.httpClient = HttpClient.newBuilder()
                .connectTimeout(Duration.ofMillis(Math.max(1_000L, connectTimeoutMs)))
                .followRedirects(HttpClient.Redirect.NORMAL)
                .executor(executor)
                .build();
    }

    public boolean isEnabled() {
        return enabled;
    }

    public boolean isRecentlyReady(DownstreamServiceRegistry.DownstreamService service) {
        Instant until = readyUntil.get(service.name());
        return until != null && Instant.now().isBefore(until);
    }

    public CompletableFuture<WakeResult> wakeAsync(
            DownstreamServiceRegistry.DownstreamService service,
            String requestId,
            String trigger
    ) {
        if (!enabled) {
            return CompletableFuture.completedFuture(new WakeResult(true, 0, 0, 0, "cold-start-guard-disabled"));
        }

        if (isRecentlyReady(service)) {
            return CompletableFuture.completedFuture(new WakeResult(true, 200, 0, 0, "recently-ready"));
        }

        Instant cooldownUntil = retryNotBefore.get(service.name());
        WakeResult recentFailure = recentFailures.get(service.name());
        if (recentFailure != null && cooldownUntil != null && Instant.now().isBefore(cooldownUntil)) {
            return CompletableFuture.completedFuture(recentFailure);
        }

        CompletableFuture<WakeResult> created = new CompletableFuture<>();
        CompletableFuture<WakeResult> existing = inFlight.putIfAbsent(service.name(), created);

        if (existing != null) {
            log.info(
                    "GW-WAKE-JOIN requestId={} service={} trigger={} state=in-flight",
                    safe(requestId), service.name(), safe(trigger)
            );
            return existing;
        }

        executor.submit(() -> {
            try {
                WakeResult result = wakeLoop(service, requestId, trigger);
                if (!result.ready()) {
                    recentFailures.put(service.name(), result);
                    retryNotBefore.merge(service.name(), Instant.now().plusSeconds(15),
                            (oldValue, newValue) -> oldValue.isAfter(newValue) ? oldValue : newValue);
                }
                created.complete(result);
            } catch (Throwable throwable) {
                log.error(
                        "GW-WAKE-CRASH requestId={} service={} trigger={} errorType={} message={}",
                        safe(requestId), service.name(), safe(trigger),
                        throwable.getClass().getSimpleName(), safeMessage(throwable.getMessage())
                );
                created.complete(new WakeResult(false, 0, 0, 0, throwable.getClass().getSimpleName()));
            } finally {
                inFlight.remove(service.name(), created);
            }
        });

        return created;
    }

    public WakeResult awaitReady(
            DownstreamServiceRegistry.DownstreamService service,
            String requestId,
            String trigger
    ) {
        return awaitReady(wakeAsync(service, requestId, trigger), service, requestId);
    }

    public WakeResult awaitReady(CompletableFuture<WakeResult> pending,
            DownstreamServiceRegistry.DownstreamService service, String requestId) {
        try {
            return pending.get(maxWaitMs + 5_000L, TimeUnit.MILLISECONDS);
        } catch (InterruptedException interruptedException) {
            Thread.currentThread().interrupt();
            return new WakeResult(false, 0, 0, 0, "interrupted");
        } catch (Exception exception) {
            log.warn(
                    "GW-WAKE-AWAIT-FAILED requestId={} service={} errorType={} message={}",
                    safe(requestId), service.name(), exception.getClass().getSimpleName(),
                    safeMessage(exception.getMessage())
            );
            return new WakeResult(false, 0, 0, 0, exception.getClass().getSimpleName());
        }
    }

    private WakeResult wakeLoop(
            DownstreamServiceRegistry.DownstreamService service,
            String requestId,
            String trigger
    ) {
        long startedAt = System.nanoTime();
        long deadlineNanos = startedAt + TimeUnit.MILLISECONDS.toNanos(maxWaitMs);
        int attempt = 0;
        int lastStatus = 0;
        String lastDetail = "not-started";

        log.info(
                "GW-WAKE-START requestId={} service={} trigger={} targetHost={} maxWaitMs={}",
                safe(requestId), service.name(), safe(trigger),
                safeHost(service.baseUri()), maxWaitMs
        );

        while (System.nanoTime() < deadlineNanos) {
            Instant notBefore = retryNotBefore.get(service.name());
            long cooldownMs = notBefore == null ? 0 : Duration.between(Instant.now(), notBefore).toMillis();
            long remainingBudgetMs = TimeUnit.NANOSECONDS.toMillis(deadlineNanos - System.nanoTime());
            if (remainingBudgetMs <= 0) break;
            if (cooldownMs > 0) {
                try {
                    Thread.sleep(Math.min(cooldownMs, remainingBudgetMs));
                } catch (InterruptedException interrupted) {
                    Thread.currentThread().interrupt();
                    return new WakeResult(false, lastStatus, attempt, elapsedMs(startedAt), "interrupted");
                }
                continue;
            }
            attempt++;
            ProbeResult probe = probe(service.healthUri(), requestId, Math.min(probeTimeoutMs, remainingBudgetMs));
            if (probe.retryAfterMs() > 0) {
                retryNotBefore.put(service.name(), Instant.now().plusMillis(probe.retryAfterMs()));
            }
            lastStatus = probe.status();
            lastDetail = probe.detail();

            // A 429 is an explicit rejection, not proof of ordinary cold startup.
            // Stop this wake task and retain the cooldown so new clients cannot
            // start another probe loop. Do not try another host or route around it.
            if (probe.status() == 429) {
                retryNotBefore.put(service.name(), Instant.now().plusMillis(
                        Math.max(60_000L, probe.retryAfterMs())));
                log.warn("GW-WAKE-THROTTLED requestId={} service={} retryAfterSeconds={} detail={}",
                        safe(requestId), service.name(), retryAfterSeconds(service), safeMessage(probe.detail()));
                return new WakeResult(false, 429, attempt, elapsedMs(startedAt), probe.detail());
            }

            if (probe.ready()) {
                recentFailures.remove(service.name());
                retryNotBefore.remove(service.name());
                readyUntil.put(service.name(), Instant.now().plusMillis(readyTtlMs));
                long elapsedMs = elapsedMs(startedAt);
                log.info(
                        "GW-WAKE-READY requestId={} service={} trigger={} attempt={} status={} elapsedMs={}",
                        safe(requestId), service.name(), safe(trigger), attempt, probe.status(), elapsedMs
                );
                return new WakeResult(true, probe.status(), attempt, elapsedMs, "UP");
            }

            if (probe.permanentFailure()) {
                long elapsedMs = elapsedMs(startedAt);
                log.error(
                        "GW-WAKE-PERMANENT-FAIL requestId={} service={} trigger={} attempt={} status={} elapsedMs={} detail={}",
                        safe(requestId), service.name(), safe(trigger), attempt, probe.status(), elapsedMs,
                        safeMessage(probe.detail())
                );
                return new WakeResult(false, probe.status(), attempt, elapsedMs, probe.detail());
            }

            long delayMs = computeDelayMs(attempt, probe.retryAfterMs());
            long remainingMs = Math.max(0L, TimeUnit.NANOSECONDS.toMillis(deadlineNanos - System.nanoTime()));
            delayMs = Math.min(delayMs, remainingMs);

            log.warn(
                    "GW-WAKE-RETRY requestId={} service={} trigger={} attempt={} status={} retryInMs={} remainingMs={} detail={}",
                    safe(requestId), service.name(), safe(trigger), attempt, probe.status(), delayMs,
                    remainingMs, safeMessage(probe.detail())
            );

            if (delayMs <= 0) {
                break;
            }

            try {
                Thread.sleep(delayMs);
            } catch (InterruptedException interruptedException) {
                Thread.currentThread().interrupt();
                return new WakeResult(false, lastStatus, attempt, elapsedMs(startedAt), "interrupted");
            }
        }

        long elapsedMs = elapsedMs(startedAt);
        log.error(
                "GW-WAKE-TIMEOUT requestId={} service={} trigger={} attempts={} lastStatus={} elapsedMs={} detail={}",
                safe(requestId), service.name(), safe(trigger), attempt, lastStatus, elapsedMs,
                safeMessage(lastDetail)
        );
        return new WakeResult(false, lastStatus, attempt, elapsedMs, lastDetail);
    }

    private ProbeResult probe(URI healthUri, String requestId, long timeoutMs) {
        HttpRequest request = HttpRequest.newBuilder(healthUri)
                .timeout(Duration.ofMillis(Math.max(1, timeoutMs)))
                .header("Accept", "application/json")
                .header("User-Agent", WAKE_USER_AGENT)
                .header("X-Guardian-Request-Id", safe(requestId))
                .GET()
                .build();

        try {
            HttpResponse<String> response = httpClient.send(request, HttpResponse.BodyHandlers.ofString());
            int status = response.statusCode();
            String body = response.body() == null ? "" : response.body();
            // Only the root Actuator status proves readiness. HTML loading pages and
            // nested component statuses must never release a pending business request.
            boolean actuatorUp = false;
            if (status == 200) {
                try {
                    actuatorUp = "UP".equals(JSON.readTree(body).path("status").asText());
                } catch (Exception ignored) {
                    // A platform loading page is not an Actuator response.
                }
            }

            if (actuatorUp) {
                return new ProbeResult(true, false, status, 0L, "UP");
            }

            boolean permanentFailure = status == 401 || status == 403 || status == 404;
            long retryAfterMs = parseRetryAfterMillis(response);
            String contentType = response.headers().firstValue("Content-Type").orElse("unknown");
            String detail = "http=" + status
                    + ",contentType=" + sanitize(contentType)
                    + ",server=" + sanitize(response.headers().firstValue("Server").orElse("none"))
                    + ",cfRay=" + sanitize(response.headers().firstValue("CF-Ray").orElse("none"))
                    + ",renderId=" + sanitize(response.headers().firstValue("Rndr-Id").orElse("none"))
                    + ",retryAfter=" + sanitize(response.headers().firstValue("Retry-After").orElse("none"))
                    + ",body=" + bodyPreview(body);
            return new ProbeResult(false, permanentFailure, status, retryAfterMs, detail);
        } catch (Exception exception) {
            return new ProbeResult(
                    false,
                    false,
                    0,
                    0L,
                    exception.getClass().getSimpleName() + ":" + safeMessage(exception.getMessage())
            );
        }
    }

    private long computeDelayMs(int attempt, long retryAfterMs) {
        if (retryAfterMs > 0) {
            return Math.max(retryAfterMs, initialBackoffMs);
        }

        int exponent = Math.min(Math.max(attempt - 1, 0), 4);
        long exponential = initialBackoffMs * (1L << exponent);
        long base = Math.min(exponential, maxBackoffMs);
        return base + ThreadLocalRandom.current().nextLong(0L, 251L);
    }

    private long parseRetryAfterMillis(HttpResponse<?> response) {
        return parseRetryAfterMillis(response.headers().firstValue("Retry-After").orElse(""));
    }

    static long parseRetryAfterMillis(String header) {
        String value = header.trim();
        if (value.isEmpty()) {
            return 0L;
        }
        try {
            long seconds = Long.parseLong(value);
            return TimeUnit.SECONDS.toMillis(Math.max(0L, seconds));
        } catch (NumberFormatException ignored) {
            try {
                return Math.max(0L, Duration.between(Instant.now(),
                        ZonedDateTime.parse(value, DateTimeFormatter.RFC_1123_DATE_TIME).toInstant()).toMillis());
            } catch (Exception invalidDate) {
                return 0L;
            }
        }
    }

    public long retryAfterSeconds(DownstreamServiceRegistry.DownstreamService service) {
        Instant until = retryNotBefore.get(service.name());
        if (until == null) return 15L;
        return Math.max(1L, (Math.max(0L, Duration.between(Instant.now(), until).toMillis()) + 999L) / 1000L);
    }

    private static long elapsedMs(long startedAtNanos) {
        return TimeUnit.NANOSECONDS.toMillis(System.nanoTime() - startedAtNanos);
    }

    private static String bodyPreview(String body) {
        if (body == null || body.isBlank()) {
            return "<empty>";
        }
        String singleLine = body.replaceAll("[\\r\\n\\t]+", " ").trim();
        if (singleLine.length() > 180) {
            singleLine = singleLine.substring(0, 180) + "...";
        }
        return sanitize(singleLine);
    }

    private static String safeHost(URI uri) {
        if (uri == null) return "unknown";
        String host = uri.getHost();
        return host == null ? "unknown" : host;
    }

    private static String safe(String value) {
        if (value == null || value.isBlank()) return "none";
        return sanitize(value.length() > 120 ? value.substring(0, 120) : value);
    }

    private static String safeMessage(String value) {
        if (value == null || value.isBlank()) return "none";
        String clean = sanitize(value);
        return clean.length() > 240 ? clean.substring(0, 240) + "..." : clean;
    }

    private static String sanitize(String value) {
        return value == null ? "" : value.replaceAll("[\\r\\n\\t]", " ");
    }

    @PreDestroy
    public void shutdown() {
        executor.shutdownNow();
    }

    private record ProbeResult(
            boolean ready,
            boolean permanentFailure,
            int status,
            long retryAfterMs,
            String detail
    ) {
    }
}
