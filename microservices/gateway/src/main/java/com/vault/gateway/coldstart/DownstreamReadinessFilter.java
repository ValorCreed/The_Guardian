package com.vault.gateway.coldstart;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.Optional;

@Component
@Order(Ordered.HIGHEST_PRECEDENCE + 20)
public class DownstreamReadinessFilter extends OncePerRequestFilter {
    private static final Logger log = LoggerFactory.getLogger(DownstreamReadinessFilter.class);

    private final DownstreamServiceRegistry registry;
    private final DownstreamWakeCoordinator wakeCoordinator;

    public DownstreamReadinessFilter(
            DownstreamServiceRegistry registry,
            DownstreamWakeCoordinator wakeCoordinator
    ) {
        this.registry = registry;
        this.wakeCoordinator = wakeCoordinator;
    }

    @Override
    protected boolean shouldNotFilter(HttpServletRequest request) {
        String path = request.getRequestURI();
        return path == null
                || path.startsWith("/actuator")
                || path.startsWith("/error");
    }

    @Override
    protected void doFilterInternal(
            HttpServletRequest request,
            HttpServletResponse response,
            FilterChain filterChain
    ) throws ServletException, IOException {
        Optional<DownstreamServiceRegistry.DownstreamService> target = registry.forPath(request.getRequestURI());
        if (target.isEmpty()) {
            filterChain.doFilter(request, response);
            return;
        }

        DownstreamServiceRegistry.DownstreamService service = target.get();
        String requestId = String.valueOf(request.getAttribute(GatewayRequestTraceFilter.REQUEST_ID_ATTRIBUTE));
        var required = registry.requiredFor(service);

        boolean allRecentlyReady = required.stream().allMatch(wakeCoordinator::isRecentlyReady);
        if (allRecentlyReady) {
            filterChain.doFilter(request, response);
            return;
        }

        String requiredNames = required.stream()
                .map(DownstreamServiceRegistry.DownstreamService::name)
                .toList()
                .toString();

        log.info(
                "GW-ROUTE-WAIT requestId={} method={} path={} service={} requiredServices={}",
                requestId, request.getMethod(), request.getRequestURI(), service.name(), requiredNames
        );

        String trigger = "route:" + request.getMethod() + ":" + request.getRequestURI();

        // Start every required wake concurrently first. awaitReady below then joins the same
        // single-flight futures instead of serially waking dependencies.
        required.forEach(requiredService ->
                wakeCoordinator.wakeAsync(requiredService, requestId, trigger)
        );

        for (DownstreamServiceRegistry.DownstreamService requiredService : required) {
            DownstreamWakeCoordinator.WakeResult result = wakeCoordinator.awaitReady(
                    requiredService,
                    requestId,
                    trigger
            );

            if (!result.ready()) {
                log.error(
                        "GW-ROUTE-BLOCKED requestId={} targetService={} failedService={} lastStatus={} attempts={} wakeElapsedMs={} detail={}",
                        requestId, service.name(), requiredService.name(), result.lastStatus(),
                        result.attempts(), result.elapsedMs(), result.detail()
                );

                writeUnavailable(response, requestId, service.name(), requiredService.name());
                return;
            }
        }

        log.info(
                "GW-ROUTE-READY requestId={} service={} requiredServices={}",
                requestId, service.name(), requiredNames
        );
        filterChain.doFilter(request, response);
    }

    private static void writeUnavailable(
            HttpServletResponse response,
            String requestId,
            String targetService,
            String failedService
    ) throws IOException {
        response.setStatus(HttpServletResponse.SC_SERVICE_UNAVAILABLE);
        response.setCharacterEncoding(StandardCharsets.UTF_8.name());
        response.setContentType(MediaType.APPLICATION_JSON_VALUE);
        response.setHeader("Retry-After", "5");
        response.getWriter().write(
                "{\"error\":\"SERVICE_WAKING\","
                        + "\"message\":\"A required Guardian service did not become ready in time. Please retry shortly.\","
                        + "\"service\":\"" + jsonEscape(targetService) + "\","
                        + "\"dependency\":\"" + jsonEscape(failedService) + "\","
                        + "\"requestId\":\"" + jsonEscape(requestId) + "\"}"
        );
    }

    private static String jsonEscape(String value) {
        if (value == null) return "";
        return value
                .replace("\\", "\\\\")
                .replace("\"", "\\\"")
                .replace("\r", "")
                .replace("\n", "");
    }
}
