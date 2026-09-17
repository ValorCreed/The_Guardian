package com.vault.gateway.diagnostics;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.time.ZonedDateTime;
import java.time.format.DateTimeFormatter;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.ConcurrentHashMap;

@Component
@Order(Ordered.HIGHEST_PRECEDENCE + 10)
public class DownstreamReadinessFilter extends OncePerRequestFilter {

    private static final Logger log = LoggerFactory.getLogger(DownstreamReadinessFilter.class);
    private static final String REQUEST_ID_HEADER = GatewayRequestTraceFilter.REQUEST_ID_HEADER;

    private final DownstreamServiceRegistry serviceRegistry;
    private final Map<String, ReadinessState> states = new ConcurrentHashMap<>();
    private final HttpClient httpClient;

    private final boolean enabled;
    private final long readyTtlMs;
    private final long startupTimeoutMs;
    private final long probeTimeoutMs;
    private final long minBackoffMs;
    private final long maxBackoffMs;

    public DownstreamReadinessFilter(
            DownstreamServiceRegistry serviceRegistry,
            @Value("${guardian.gateway.readiness.enabled:true}") boolean enabled,
            @Value("${guardian.gateway.readiness.ready-ttl-ms:600000}") long readyTtlMs,
            @Value("${guardian.gateway.readiness.startup-timeout-ms:90000}") long startupTimeoutMs,
            @Value("${guardian.gateway.readiness.probe-timeout-ms:12000}") long probeTimeoutMs,
            @Value("${guardian.gateway.readiness.min-backoff-ms:750}") long minBackoffMs,
            @Value("${guardian.gateway.readiness.max-backoff-ms:5000}") long maxBackoffMs
    ) {
        this.serviceRegistry = serviceRegistry;
        this.enabled = enabled;
        this.readyTtlMs = Math.max(5_000L, readyTtlMs);
        this.startupTimeoutMs = Math.max(10_000L, startupTimeoutMs);
        this.probeTimeoutMs = Math.max(2_000L, probeTimeoutMs);
        this.minBackoffMs = Math.max(250L, minBackoffMs);
        this.maxBackoffMs = Math.max(this.minBackoffMs, maxBackoffMs);
        this.httpClient = HttpClient.newBuilder()
                .connectTimeout(Duration.ofMillis(Math.min(this.probeTimeoutMs, 10_000L)))
                .followRedirects(HttpClient.Redirect.NORMAL)
                .build();

        log.info(
                "GW-START downstream readiness enabled={} readyTtlMs={} startupTimeoutMs={} probeTimeoutMs={} minBackoffMs={} maxBackoffMs={}",
                this.enabled,
                this.readyTtlMs,
                this.startupTimeoutMs,
                this.probeTimeoutMs,
                this.minBackoffMs,
                this.maxBackoffMs
        );
    }

    @Override
    protected boolean shouldNotFilter(HttpServletRequest request) {
        if (!enabled) return true;

        String path = request.getRequestURI();
        if (path == null
                || path.equals("/actuator/health")
                || path.equals("/actuator/info")) {
            return true;
        }

        String method = request.getMethod();
        return "OPTIONS".equalsIgnoreCase(method);
    }

    @Override
    protected void doFilterInternal(
            HttpServletRequest request,
            HttpServletResponse response,
            FilterChain filterChain
    ) throws ServletException, IOException {
        Optional<DownstreamServiceRegistry.ServiceTarget> resolved =
                serviceRegistry.resolve(request.getRequestURI());

        if (resolved.isEmpty() || resolved.get().local()) {
            filterChain.doFilter(request, response);
            return;
        }

        DownstreamServiceRegistry.ServiceTarget target = resolved.get();
        ReadinessState state = states.computeIfAbsent(target.name(), ignored -> new ReadinessState());

        if (isFreshlyReady(state)) {
            filterChain.doFilter(request, response);
            return;
        }

        String requestId = Optional.ofNullable(request.getHeader(REQUEST_ID_HEADER))
                .filter(value -> !value.isBlank())
                .orElse("unknown");

        if (!awaitReady(target, state, requestId)) {
            writeStartingResponse(response, target, requestId, state);
            return;
        }

        filterChain.doFilter(request, response);
    }

    private boolean awaitReady(
            DownstreamServiceRegistry.ServiceTarget target,
            ReadinessState state,
            String requestId
    ) {
        synchronized (state.monitor) {
            if (isFreshlyReady(state)) {
                return true;
            }

            long startedAt = System.currentTimeMillis();
            long deadline = startedAt + startupTimeoutMs;
            long backoffMs = minBackoffMs;
            int attempt = 0;

            log.info(
                    "GW-WAKE requestId={} service={} target={} event=start",
                    requestId,
                    target.name(),
                    target.safeAuthority()
            );

            while (System.currentTimeMillis() < deadline) {
                attempt++;
                ProbeResult result = probe(target, attempt);
                state.lastStatus = result.statusCode();
                state.lastDetail = result.detail();
                state.lastProbeAt = System.currentTimeMillis();

                if (result.ready()) {
                    state.readyUntil = System.currentTimeMillis() + readyTtlMs;
                    long elapsedMs = System.currentTimeMillis() - startedAt;
                    log.info(
                            "GW-WAKE requestId={} service={} target={} event=ready attempt={} status={} elapsedMs={}",
                            requestId,
                            target.name(),
                            target.safeAuthority(),
                            attempt,
                            result.statusCode(),
                            elapsedMs
                    );
                    return true;
                }

                long delayMs = result.retryAfterMs() > 0
                        ? result.retryAfterMs()
                        : backoffMs;

                if (result.statusCode() == 429) {
                    log.warn(
                            "GW-WAKE requestId={} service={} target={} event=rate-limited attempt={} status=429 retryAfterMs={} detail={}",
                            requestId,
                            target.name(),
                            target.safeAuthority(),
                            attempt,
                            delayMs,
                            result.detail()
                    );
                } else {
                    log.info(
                            "GW-WAKE requestId={} service={} target={} event=waiting attempt={} status={} delayMs={} detail={}",
                            requestId,
                            target.name(),
                            target.safeAuthority(),
                            attempt,
                            result.statusCode(),
                            delayMs,
                            result.detail()
                    );
                }

                long remaining = deadline - System.currentTimeMillis();
                if (remaining <= 0) break;

                sleep(Math.min(delayMs, remaining));
                backoffMs = Math.min(maxBackoffMs, Math.max(minBackoffMs, backoffMs * 2));
            }

            long elapsedMs = System.currentTimeMillis() - startedAt;
            log.warn(
                    "GW-WAKE requestId={} service={} target={} event=timeout attempts={} lastStatus={} lastDetail={} elapsedMs={}",
                    requestId,
                    target.name(),
                    target.safeAuthority(),
                    attempt,
                    state.lastStatus,
                    state.lastDetail,
                    elapsedMs
            );
            return false;
        }
    }

    private ProbeResult probe(
            DownstreamServiceRegistry.ServiceTarget target,
            int attempt
    ) {
        HttpRequest probeRequest = HttpRequest.newBuilder(target.healthUri())
                .GET()
                .timeout(Duration.ofMillis(probeTimeoutMs))
                .header("Accept", MediaType.APPLICATION_JSON_VALUE)
                .header("User-Agent", "guardian-gateway-readiness/1.0")
                .build();

        try {
            HttpResponse<String> response = httpClient.send(
                    probeRequest,
                    HttpResponse.BodyHandlers.ofString()
            );

            int status = response.statusCode();
            String body = response.body() == null ? "" : response.body();
            String compactBody = body.replaceAll("\\s+", "");
            boolean actuatorUp = status >= 200
                    && status < 300
                    && compactBody.contains("\"status\":\"UP\"");

            if (actuatorUp) {
                return new ProbeResult(true, status, 0L, "actuator-UP");
            }

            long retryAfterMs = status == 429
                    ? parseRetryAfterMs(response.headers().firstValue("Retry-After").orElse(null))
                    : 0L;

            String contentType = response.headers()
                    .firstValue("Content-Type")
                    .orElse("unknown");
            return new ProbeResult(
                    false,
                    status,
                    retryAfterMs,
                    "contentType=" + sanitize(contentType)
            );
        } catch (InterruptedException interrupted) {
            Thread.currentThread().interrupt();
            return new ProbeResult(false, 0, 0L, "interrupted");
        } catch (Exception exception) {
            return new ProbeResult(
                    false,
                    0,
                    0L,
                    exception.getClass().getSimpleName()
            );
        }
    }

    private boolean isFreshlyReady(ReadinessState state) {
        return state.readyUntil > System.currentTimeMillis();
    }

    private void writeStartingResponse(
            HttpServletResponse response,
            DownstreamServiceRegistry.ServiceTarget target,
            String requestId,
            ReadinessState state
    ) throws IOException {
        response.setStatus(HttpServletResponse.SC_SERVICE_UNAVAILABLE);
        response.setCharacterEncoding("UTF-8");
        response.setContentType(MediaType.APPLICATION_JSON_VALUE);
        response.setHeader("Retry-After", "5");
        response.getWriter().write(
                "{"
                        + "\"code\":\"DOWNSTREAM_STARTING\","
                        + "\"message\":\"Guardian's " + json(target.name())
                        + " service is still starting. Please try again shortly.\","
                        + "\"service\":\"" + json(target.name()) + "\","
                        + "\"requestId\":\"" + json(requestId) + "\","
                        + "\"lastStatus\":" + state.lastStatus
                        + "}"
        );
    }

    private long parseRetryAfterMs(String value) {
        if (value == null || value.isBlank()) return 0L;

        try {
            long seconds = Long.parseLong(value.trim());
            return Math.max(0L, seconds * 1_000L);
        } catch (NumberFormatException ignored) {
            // Retry-After may also be an HTTP date.
        }

        try {
            ZonedDateTime retryAt = ZonedDateTime.parse(
                    value.trim(),
                    DateTimeFormatter.RFC_1123_DATE_TIME
            );
            return Math.max(
                    0L,
                    Duration.between(ZonedDateTime.now(retryAt.getZone()), retryAt).toMillis()
            );
        } catch (Exception ignored) {
            return 0L;
        }
    }

    private void sleep(long delayMs) {
        if (delayMs <= 0) return;
        try {
            Thread.sleep(delayMs);
        } catch (InterruptedException interrupted) {
            Thread.currentThread().interrupt();
        }
    }

    private String sanitize(String value) {
        if (value == null) return "unknown";
        return value.replaceAll("[\\r\\n\\t]", " ").trim();
    }

    private String json(String value) {
        if (value == null) return "";
        return value
                .replace("\\", "\\\\")
                .replace("\"", "\\\"");
    }

    private static final class ReadinessState {
        private final Object monitor = new Object();
        private volatile long readyUntil = 0L;
        private volatile long lastProbeAt = 0L;
        private volatile int lastStatus = 0;
        private volatile String lastDetail = "not-probed";
    }

    private record ProbeResult(
            boolean ready,
            int statusCode,
            long retryAfterMs,
            String detail
    ) {}
}
