package com.vault.gateway.coldstart;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletRequestWrapper;
import jakarta.servlet.http.HttpServletResponse;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.net.URI;
import java.util.ArrayList;
import java.util.Collections;
import java.util.Enumeration;
import java.util.List;
import java.util.Locale;
import java.util.Optional;
import java.util.UUID;

@Component
@Order(Ordered.HIGHEST_PRECEDENCE)
public class GatewayRequestTraceFilter extends OncePerRequestFilter {
    public static final String REQUEST_ID_HEADER = "X-Guardian-Request-Id";
    public static final String REQUEST_ID_ATTRIBUTE = GatewayRequestTraceFilter.class.getName() + ".requestId";

    private static final Logger log = LoggerFactory.getLogger(GatewayRequestTraceFilter.class);

    private final DownstreamServiceRegistry registry;

    public GatewayRequestTraceFilter(DownstreamServiceRegistry registry) {
        this.registry = registry;
    }

    @Override
    protected void doFilterInternal(
            HttpServletRequest request,
            HttpServletResponse response,
            FilterChain filterChain
    ) throws ServletException, IOException {
        String requestId = normalizeRequestId(request.getHeader(REQUEST_ID_HEADER));
        request.setAttribute(REQUEST_ID_ATTRIBUTE, requestId);
        response.setHeader(REQUEST_ID_HEADER, requestId);

        Optional<DownstreamServiceRegistry.DownstreamService> target = registry.forPath(request.getRequestURI());
        String serviceName = target.map(DownstreamServiceRegistry.DownstreamService::name).orElse("gateway");
        String targetHost = target.map(DownstreamServiceRegistry.DownstreamService::baseUri)
                .map(URI::getHost)
                .orElse("gateway");
        long startedAt = System.nanoTime();

        log.info(
                "GW-IN requestId={} method={} path={} service={} targetHost={} inboundCfRay={} inboundRndrId={}",
                requestId, request.getMethod(), request.getRequestURI(), serviceName, targetHost,
                safeHeader(request.getHeader("CF-Ray")), safeHeader(request.getHeader("Rndr-Id"))
        );

        HttpServletRequest wrapped = new RequestIdHeaderRequestWrapper(request, requestId);

        try {
            filterChain.doFilter(wrapped, response);
        } finally {
            long elapsedMs = (System.nanoTime() - startedAt) / 1_000_000L;
            log.info(
                    "GW-OUT requestId={} method={} path={} service={} targetHost={} status={} elapsedMs={} " +
                            "responseCfRay={} responseRndrId={} retryAfter={} server={}",
                    requestId, request.getMethod(), request.getRequestURI(), serviceName, targetHost,
                    response.getStatus(), elapsedMs,
                    safeHeader(response.getHeader("CF-Ray")),
                    safeHeader(response.getHeader("Rndr-Id")),
                    safeHeader(response.getHeader("Retry-After")),
                    safeHeader(response.getHeader("Server"))
            );
        }
    }

    private static String safeHeader(String value) {
        if (value == null || value.isBlank()) return "none";
        String clean = value.replaceAll("[\r\n\t]", " ").trim();
        return clean.length() <= 160 ? clean : clean.substring(0, 160);
    }

    private static String normalizeRequestId(String candidate) {
        if (candidate != null) {
            String clean = candidate.trim();
            if (!clean.isBlank() && clean.length() <= 120 && clean.matches("[A-Za-z0-9._:-]+")) {
                return clean;
            }
        }
        return UUID.randomUUID().toString();
    }

    private static final class RequestIdHeaderRequestWrapper extends HttpServletRequestWrapper {
        private final String requestId;

        private RequestIdHeaderRequestWrapper(HttpServletRequest request, String requestId) {
            super(request);
            this.requestId = requestId;
        }

        @Override
        public String getHeader(String name) {
            if (REQUEST_ID_HEADER.equalsIgnoreCase(name)) {
                return requestId;
            }
            return super.getHeader(name);
        }

        @Override
        public Enumeration<String> getHeaders(String name) {
            if (REQUEST_ID_HEADER.equalsIgnoreCase(name)) {
                return Collections.enumeration(List.of(requestId));
            }
            return super.getHeaders(name);
        }

        @Override
        public Enumeration<String> getHeaderNames() {
            List<String> names = new ArrayList<>();
            Enumeration<String> original = super.getHeaderNames();
            boolean requestIdPresent = false;

            while (original != null && original.hasMoreElements()) {
                String name = original.nextElement();
                names.add(name);
                if (REQUEST_ID_HEADER.toLowerCase(Locale.ROOT).equals(name.toLowerCase(Locale.ROOT))) {
                    requestIdPresent = true;
                }
            }

            if (!requestIdPresent) {
                names.add(REQUEST_ID_HEADER);
            }
            return Collections.enumeration(names);
        }
    }
}
