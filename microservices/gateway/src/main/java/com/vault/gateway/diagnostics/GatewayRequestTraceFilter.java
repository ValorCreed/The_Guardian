package com.vault.gateway.diagnostics;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletRequestWrapper;
import jakarta.servlet.http.HttpServletResponse;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.slf4j.MDC;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.util.ArrayList;
import java.util.Collections;
import java.util.Enumeration;
import java.util.List;
import java.util.UUID;
import java.util.regex.Pattern;

@Component
@Order(Ordered.HIGHEST_PRECEDENCE + 5)
public class GatewayRequestTraceFilter extends OncePerRequestFilter {

    public static final String REQUEST_ID_HEADER = "X-Guardian-Request-Id";
    private static final Logger log = LoggerFactory.getLogger(GatewayRequestTraceFilter.class);
    private static final Pattern SAFE_REQUEST_ID = Pattern.compile("[A-Za-z0-9._-]{8,80}");

    private final DownstreamServiceRegistry serviceRegistry;

    public GatewayRequestTraceFilter(DownstreamServiceRegistry serviceRegistry) {
        this.serviceRegistry = serviceRegistry;
    }

    @Override
    protected boolean shouldNotFilter(HttpServletRequest request) {
        String path = request.getRequestURI();
        return path == null
                || path.equals("/actuator/health")
                || path.equals("/actuator/info");
    }

    @Override
    protected void doFilterInternal(
            HttpServletRequest request,
            HttpServletResponse response,
            FilterChain filterChain
    ) throws ServletException, IOException {
        String requestId = resolveRequestId(request.getHeader(REQUEST_ID_HEADER));
        String path = request.getRequestURI();
        String service = serviceRegistry.resolve(path)
                .map(DownstreamServiceRegistry.ServiceTarget::name)
                .orElse("gateway");
        long startedAt = System.nanoTime();

        response.setHeader(REQUEST_ID_HEADER, requestId);

        HeaderInjectingRequest wrappedRequest =
                new HeaderInjectingRequest(request, REQUEST_ID_HEADER, requestId);

        MDC.put("requestId", requestId);
        MDC.put("downstreamService", service);
        try {
            log.info(
                    "GW-IN requestId={} method={} path={} service={}",
                    requestId,
                    request.getMethod(),
                    path,
                    service
            );

            filterChain.doFilter(wrappedRequest, response);
        } finally {
            long elapsedMs = (System.nanoTime() - startedAt) / 1_000_000L;
            int status = response.getStatus();

            if (status == 429) {
                log.warn(
                        "GW-OUT requestId={} method={} path={} service={} status=429 elapsedMs={} retryAfter={} message=downstream-or-edge-rate-limit",
                        requestId,
                        request.getMethod(),
                        path,
                        service,
                        elapsedMs,
                        response.getHeader("Retry-After")
                );
            } else if (status >= 500) {
                log.warn(
                        "GW-OUT requestId={} method={} path={} service={} status={} elapsedMs={}",
                        requestId,
                        request.getMethod(),
                        path,
                        service,
                        status,
                        elapsedMs
                );
            } else {
                log.info(
                        "GW-OUT requestId={} method={} path={} service={} status={} elapsedMs={}",
                        requestId,
                        request.getMethod(),
                        path,
                        service,
                        status,
                        elapsedMs
                );
            }

            MDC.remove("requestId");
            MDC.remove("downstreamService");
        }
    }

    private String resolveRequestId(String supplied) {
        if (supplied != null && SAFE_REQUEST_ID.matcher(supplied.trim()).matches()) {
            return supplied.trim();
        }
        return UUID.randomUUID().toString();
    }

    private static final class HeaderInjectingRequest extends HttpServletRequestWrapper {
        private final String headerName;
        private final String headerValue;

        private HeaderInjectingRequest(
                HttpServletRequest request,
                String headerName,
                String headerValue
        ) {
            super(request);
            this.headerName = headerName;
            this.headerValue = headerValue;
        }

        @Override
        public String getHeader(String name) {
            if (headerName.equalsIgnoreCase(name)) {
                return headerValue;
            }
            return super.getHeader(name);
        }

        @Override
        public Enumeration<String> getHeaders(String name) {
            if (headerName.equalsIgnoreCase(name)) {
                return Collections.enumeration(List.of(headerValue));
            }
            return super.getHeaders(name);
        }

        @Override
        public Enumeration<String> getHeaderNames() {
            List<String> names = new ArrayList<>();
            Enumeration<String> original = super.getHeaderNames();
            if (original != null) {
                while (original.hasMoreElements()) {
                    names.add(original.nextElement());
                }
            }
            boolean alreadyPresent = names.stream().anyMatch(headerName::equalsIgnoreCase);
            if (!alreadyPresent) {
                names.add(headerName);
            }
            return Collections.enumeration(names);
        }
    }
}
