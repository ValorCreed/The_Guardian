package com.vault.theguardian.vaultservice.auth;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.http.MediaType;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.List;

@Component
public class JwtAuthenticationFilter extends OncePerRequestFilter {
    private final AuthIntrospectionClient authIntrospectionClient;

    public JwtAuthenticationFilter(AuthIntrospectionClient authIntrospectionClient) {
        this.authIntrospectionClient = authIntrospectionClient;
    }

    @Override
    protected boolean shouldNotFilter(HttpServletRequest request) {
        String path = request.getServletPath();
        return path.equals("/")
                || path.equals("/actuator/health")
                || path.equals("/actuator/info")
                || path.startsWith("/internal/vault/");
    }

    @Override
    protected void doFilterInternal(
            HttpServletRequest request,
            HttpServletResponse response,
            FilterChain filterChain
    ) throws ServletException, IOException {
        String authorization = request.getHeader("Authorization");

        if (authorization == null || !authorization.startsWith("Bearer ")) {
            writeError(response, HttpServletResponse.SC_UNAUTHORIZED, "Missing bearer token.");
            return;
        }

        String token = authorization.substring(7).trim();
        if (token.isBlank()) {
            writeError(response, HttpServletResponse.SC_UNAUTHORIZED, "Missing bearer token.");
            return;
        }

        try {
            TokenIntrospectionResponse introspection = authIntrospectionClient.introspect(token);
            if (!introspection.active() || introspection.userId() == null) {
                writeSessionRevokedError(response);
                return;
            }


            if (introspection.lockdownActive()) {
                writeLockdownError(response);
                return;
            }

            AuthenticatedUser principal = new AuthenticatedUser(
                    introspection.userId(), introspection.email(), introspection.sessionMode()
            );
            UsernamePasswordAuthenticationToken authentication =
                    new UsernamePasswordAuthenticationToken(principal, null, List.of());
            SecurityContextHolder.getContext().setAuthentication(authentication);
            filterChain.doFilter(request, response);
        } catch (AuthServiceUnavailableException exception) {
            SecurityContextHolder.clearContext();
            writeError(response, HttpServletResponse.SC_SERVICE_UNAVAILABLE,
                    "Authentication service is temporarily unavailable.");
        } finally {
            SecurityContextHolder.clearContext();
        }
    }

    private void writeSessionRevokedError(HttpServletResponse response) throws IOException {
        response.setStatus(HttpServletResponse.SC_UNAUTHORIZED);
        response.setCharacterEncoding(StandardCharsets.UTF_8.name());
        response.setContentType(MediaType.APPLICATION_JSON_VALUE);
        response.getWriter().write(
                "{\"code\":\"SESSION_REVOKED\",\"message\":\"This Guardian session is no longer active.\"}"
        );
    }

    private void writeLockdownError(HttpServletResponse response) throws IOException {
        response.setStatus(423);
        response.setCharacterEncoding(StandardCharsets.UTF_8.name());
        response.setContentType(MediaType.APPLICATION_JSON_VALUE);
        response.getWriter().write(
                "{\"code\":\"ACCOUNT_LOCKDOWN_ACTIVE\",\"message\":\"Incident Lockdown is active. Continue recovery on the designated device.\"}"
        );
    }

    private void writeError(HttpServletResponse response, int status, String message) throws IOException {
        response.setStatus(status);
        response.setCharacterEncoding(StandardCharsets.UTF_8.name());
        response.setContentType(MediaType.APPLICATION_JSON_VALUE);
        response.getWriter().write("{\"message\":\"" + message + "\"}");
    }
}
