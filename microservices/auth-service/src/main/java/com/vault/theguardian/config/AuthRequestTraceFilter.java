package com.vault.theguardian.config;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.util.UUID;
import java.util.regex.Pattern;

@Component
@Order(Ordered.HIGHEST_PRECEDENCE + 5)
public class AuthRequestTraceFilter extends OncePerRequestFilter {

    private static final Logger log = LoggerFactory.getLogger(AuthRequestTraceFilter.class);
    private static final String REQUEST_ID_HEADER = "X-Guardian-Request-Id";
    private static final Pattern SAFE_REQUEST_ID = Pattern.compile("[A-Za-z0-9._-]{8,80}");

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
        long startedAt = System.nanoTime();

        response.setHeader(REQUEST_ID_HEADER, requestId);

        log.info(
                "AUTH-IN requestId={} method={} path={}",
                requestId,
                request.getMethod(),
                request.getRequestURI()
        );

        try {
            filterChain.doFilter(request, response);
        } finally {
            long elapsedMs = (System.nanoTime() - startedAt) / 1_000_000L;
            int status = response.getStatus();

            if (status == 429) {
                log.warn(
                        "AUTH-OUT requestId={} method={} path={} status=429 elapsedMs={} retryAfter={}",
                        requestId,
                        request.getMethod(),
                        request.getRequestURI(),
                        elapsedMs,
                        response.getHeader("Retry-After")
                );
            } else if (status >= 500) {
                log.warn(
                        "AUTH-OUT requestId={} method={} path={} status={} elapsedMs={}",
                        requestId,
                        request.getMethod(),
                        request.getRequestURI(),
                        status,
                        elapsedMs
                );
            } else {
                log.info(
                        "AUTH-OUT requestId={} method={} path={} status={} elapsedMs={}",
                        requestId,
                        request.getMethod(),
                        request.getRequestURI(),
                        status,
                        elapsedMs
                );
            }
        }
    }

    private String resolveRequestId(String supplied) {
        if (supplied != null && SAFE_REQUEST_ID.matcher(supplied.trim()).matches()) {
            return supplied.trim();
        }
        return UUID.randomUUID().toString();
    }
}
