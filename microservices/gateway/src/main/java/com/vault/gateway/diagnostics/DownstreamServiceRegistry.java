package com.vault.gateway.diagnostics;

import jakarta.annotation.PostConstruct;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.core.env.Environment;
import org.springframework.stereotype.Component;

import java.net.URI;
import java.util.List;
import java.util.Optional;

@Component
public class DownstreamServiceRegistry {

    private static final Logger log = LoggerFactory.getLogger(DownstreamServiceRegistry.class);

    private final List<ServiceTarget> targets;

    public DownstreamServiceRegistry(Environment environment) {
        this.targets = List.of(
                target(
                        "auth",
                        value(environment, "AUTH_SERVICE_URL", "http://localhost:8081"),
                        "/vault/auth", "/vault/sessions"
                ),
                target(
                        "notifications",
                        value(environment, "NOTIFICATION_SERVICE_URL", "http://localhost:8082"),
                        "/vault/notifications"
                ),
                target(
                        "subscriptions",
                        value(environment, "SUBSCRIPTION_SERVICE_URL", "http://localhost:8083"),
                        "/vault/api/subscriptions", "/vault/payments"
                ),
                target(
                        "vault",
                        value(environment, "VAULT_SERVICE_URL", "http://localhost:8084"),
                        "/api/vault", "/vault/cards", "/vault/documents", "/vault/notes"
                ),
                target(
                        "access-sharing",
                        value(environment, "ACCESS_SHARING_SERVICE_URL", "http://localhost:8085"),
                        "/vault/family", "/vault/emergency", "/vault/safety-check",
                        "/vault/estate-playbooks", "/vault/continuity-drill"
                ),
                target(
                        "backup-recovery",
                        value(environment, "BACKUP_RECOVERY_SERVICE_URL", "http://localhost:8086"),
                        "/vault/backup", "/vault/recovery-kit", "/vault/recovery-circle"
                ),
                target(
                        "user-account",
                        value(environment, "USER_ACCOUNT_SERVICE_URL", "http://localhost:8087"),
                        "/vault/users"
                ),
                target(
                        "security-health",
                        value(environment, "SECURITY_HEALTH_SERVICE_URL", "http://localhost:8088"),
                        "/vault/security-alerts"
                ),
                target(
                        "support",
                        value(environment, "SUPPORT_SERVICE_URL", "http://localhost:8090"),
                        "/vault/support"
                )
        );
    }

    public Optional<ServiceTarget> resolve(String requestPath) {
        if (requestPath == null || requestPath.isBlank()) {
            return Optional.empty();
        }

        return targets.stream()
                .filter(target -> target.pathPrefixes().stream()
                        .anyMatch(prefix -> requestPath.equals(prefix)
                                || requestPath.startsWith(prefix + "/")))
                .findFirst();
    }

    public List<ServiceTarget> targets() {
        return targets;
    }

    @PostConstruct
    void logRoutes() {
        log.info("GW-START downstream readiness registry initialized with {} services", targets.size());
        for (ServiceTarget target : targets) {
            log.info(
                    "GW-START service={} target={} local={}",
                    target.name(),
                    target.safeAuthority(),
                    target.local()
            );
        }
    }

    private static ServiceTarget target(String name, String baseUrl, String... prefixes) {
        String cleanBaseUrl = trimTrailingSlash(baseUrl);
        URI uri = URI.create(cleanBaseUrl);
        String host = uri.getHost();
        boolean local = host == null
                || host.equalsIgnoreCase("localhost")
                || host.equals("127.0.0.1")
                || host.equals("0.0.0.0");

        return new ServiceTarget(
                name,
                cleanBaseUrl,
                List.of(prefixes),
                local,
                safeAuthority(uri)
        );
    }

    private static String value(Environment environment, String key, String fallback) {
        String value = environment.getProperty(key);
        return value == null || value.isBlank() ? fallback : value.trim();
    }

    private static String trimTrailingSlash(String value) {
        String result = value == null ? "" : value.trim();
        while (result.endsWith("/")) {
            result = result.substring(0, result.length() - 1);
        }
        return result;
    }

    private static String safeAuthority(URI uri) {
        if (uri == null) return "unknown";
        String host = uri.getHost();
        if (host == null || host.isBlank()) return "unknown";
        int port = uri.getPort();
        return port > 0 ? host + ":" + port : host;
    }

    public record ServiceTarget(
            String name,
            String baseUrl,
            List<String> pathPrefixes,
            boolean local,
            String safeAuthority
    ) {
        public URI healthUri() {
            return URI.create(baseUrl + "/actuator/health");
        }
    }
}
