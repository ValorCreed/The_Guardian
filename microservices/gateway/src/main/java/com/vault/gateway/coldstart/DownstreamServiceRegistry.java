package com.vault.gateway.coldstart;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import java.net.URI;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;

@Component
public class DownstreamServiceRegistry {

    public record DownstreamService(
            String name,
            URI baseUri,
            List<String> routePrefixes,
            List<String> dependencies,
            boolean routedThroughGateway
    ) {
        public URI healthUri() {
            String base = baseUri.toString();
            if (base.endsWith("/")) {
                base = base.substring(0, base.length() - 1);
            }
            return URI.create(base + "/actuator/health");
        }
    }

    private final List<DownstreamService> services;
    private final Map<String, DownstreamService> byName;

    public DownstreamServiceRegistry(
            @Value("${AUTH_SERVICE_URL:http://localhost:8081}") String authUrl,
            @Value("${NOTIFICATION_SERVICE_URL:http://localhost:8082}") String notificationUrl,
            @Value("${SUBSCRIPTION_SERVICE_URL:http://localhost:8083}") String subscriptionUrl,
            @Value("${VAULT_SERVICE_URL:http://localhost:8084}") String vaultUrl,
            @Value("${ACCESS_SHARING_SERVICE_URL:http://localhost:8085}") String sharingUrl,
            @Value("${BACKUP_RECOVERY_SERVICE_URL:http://localhost:8086}") String backupUrl,
            @Value("${USER_ACCOUNT_SERVICE_URL:http://localhost:8087}") String accountUrl,
            @Value("${SECURITY_HEALTH_SERVICE_URL:http://localhost:8088}") String securityUrl,
            @Value("${SUPPORT_SERVICE_URL:http://localhost:8090}") String supportUrl,
            @Value("${EMAIL_SERVICE_URL:http://localhost:8091}") String emailUrl
    ) {
        this.services = List.of(
                service("auth", authUrl, true, List.of("email"),
                        "/vault/auth", "/vault/sessions"),
                service("notifications", notificationUrl, true, List.of("auth"),
                        "/vault/notifications"),
                service("subscriptions", subscriptionUrl, true, List.of("auth", "notifications"),
                        "/vault/api/subscriptions", "/vault/payments"),
                service("vault", vaultUrl, true, List.of("auth", "subscriptions", "notifications"),
                        "/api/vault", "/vault/cards", "/vault/documents", "/vault/notes"),
                service("sharing", sharingUrl, true,
                        List.of("auth", "subscriptions", "vault", "backup", "notifications", "email"),
                        "/vault/family", "/vault/emergency", "/vault/safety-check",
                        "/vault/estate-playbooks", "/vault/continuity-drill"),
                service("backup", backupUrl, true,
                        List.of("auth", "subscriptions", "vault", "sharing", "notifications"),
                        "/vault/backup", "/vault/recovery-kit", "/vault/recovery-circle"),
                service("account", accountUrl, true,
                        List.of("auth", "subscriptions", "vault", "sharing", "backup", "notifications"),
                        "/vault/users"),
                service("security", securityUrl, true,
                        List.of("auth", "subscriptions", "notifications"),
                        "/vault/security-alerts"),
                service("support", supportUrl, true, List.of("auth", "email"),
                        "/vault/support"),
                service("email", emailUrl, false, List.of())
        );

        Map<String, DownstreamService> servicesByName = new LinkedHashMap<>();
        for (DownstreamService service : services) {
            servicesByName.put(service.name(), service);
        }
        this.byName = Map.copyOf(servicesByName);
    }

    private static DownstreamService service(
            String name,
            String url,
            boolean routedThroughGateway,
            List<String> dependencies,
            String... prefixes
    ) {
        return new DownstreamService(
                name,
                URI.create(url),
                List.of(prefixes),
                List.copyOf(dependencies),
                routedThroughGateway
        );
    }

    public List<DownstreamService> all() {
        return services;
    }

    public Optional<DownstreamService> byName(String name) {
        return Optional.ofNullable(byName.get(name));
    }

    public Optional<DownstreamService> forPath(String path) {
        if (path == null || path.isBlank()) {
            return Optional.empty();
        }

        return services.stream()
                .filter(DownstreamService::routedThroughGateway)
                .filter(service -> service.routePrefixes().stream().anyMatch(prefix -> matchesPrefix(path, prefix)))
                .findFirst();
    }

    /**
     * Returns the route target plus every transitive service dependency.
     * Cycles (notably sharing <-> backup) are intentionally tolerated and de-duplicated.
     */
    public List<DownstreamService> requiredFor(DownstreamService target) {
        Set<String> visited = new LinkedHashSet<>();
        List<DownstreamService> required = new ArrayList<>();
        visit(target.name(), visited, required);
        return List.copyOf(required);
    }

    private void visit(String serviceName, Set<String> visited, List<DownstreamService> required) {
        if (!visited.add(serviceName)) {
            return;
        }

        DownstreamService service = byName.get(serviceName);
        if (service == null) {
            return;
        }

        required.add(service);
        for (String dependencyName : service.dependencies()) {
            visit(dependencyName, visited, required);
        }
    }

    private static boolean matchesPrefix(String path, String prefix) {
        return path.equals(prefix) || path.startsWith(prefix + "/");
    }
}
