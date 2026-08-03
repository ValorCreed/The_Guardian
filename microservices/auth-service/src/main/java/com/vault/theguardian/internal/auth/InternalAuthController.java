package com.vault.theguardian.internal.auth;

import com.vault.theguardian.incident.SecurityIncidentService;
import com.vault.theguardian.security.JwtService;
import com.vault.theguardian.session.UserSession;
import com.vault.theguardian.session.UserSessionRepository;
import com.vault.theguardian.subscription.Subscription;
import com.vault.theguardian.subscription.SubscriptionPlan;
import com.vault.theguardian.subscription.SubscriptionRepository;
import com.vault.theguardian.user.User;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.LocalDateTime;

@RestController
@RequestMapping("/internal/auth")
public class InternalAuthController {
    private static final String INTERNAL_KEY_HEADER = "X-Internal-Service-Key";

    private final JwtService jwtService;
    private final UserSessionRepository userSessionRepository;
    private final SubscriptionRepository subscriptionRepository;
    private final SecurityIncidentService securityIncidentService;
    private final byte[] expectedInternalKey;

    public InternalAuthController(
            JwtService jwtService,
            UserSessionRepository userSessionRepository,
            SubscriptionRepository subscriptionRepository,
            SecurityIncidentService securityIncidentService,
            @Value("${internal.service.key}") String internalServiceKey
    ) {
        if (internalServiceKey == null || internalServiceKey.isBlank()) {
            throw new IllegalStateException("INTERNAL_SERVICE_KEY must be configured.");
        }
        this.jwtService = jwtService;
        this.userSessionRepository = userSessionRepository;
        this.subscriptionRepository = subscriptionRepository;
        this.securityIncidentService = securityIncidentService;
        this.expectedInternalKey = internalServiceKey.getBytes(StandardCharsets.UTF_8);
    }

    @PostMapping("/introspect")
    public TokenIntrospectionResponse introspect(
            @RequestHeader(value = INTERNAL_KEY_HEADER, required = false) String suppliedKey,
            @RequestHeader(value = HttpHeaders.AUTHORIZATION, required = false) String authorization
    ) {
        requireValidInternalKey(suppliedKey);

        if (authorization == null || !authorization.startsWith("Bearer ")) {
            return TokenIntrospectionResponse.inactive();
        }

        String token = authorization.substring(7).trim();
        if (token.isBlank() || !jwtService.isTokenValid(token)) {
            return TokenIntrospectionResponse.inactive();
        }

        String tokenId = jwtService.extractTokenId(token);
        String email = jwtService.extractEmail(token);
        if (tokenId == null || tokenId.isBlank() || email == null || email.isBlank()) {
            return TokenIntrospectionResponse.inactive();
        }

        UserSession session = userSessionRepository.findByTokenIdAndActiveTrue(tokenId)
                .orElse(null);
        if (session == null || session.getUser() == null) {
            return TokenIntrospectionResponse.inactive();
        }

        User user = session.getUser();
        if (!user.getEmail().equalsIgnoreCase(email)) {
            return TokenIntrospectionResponse.inactive();
        }

        /*
         * Every downstream microservice relies on this result. Returning an
         * inactive token here prevents legacy unverified accounts from using an
         * old session to reach Vault, Family, Subscription, or other services.
         */
        if (!user.isEmailVerified()) {
            return TokenIntrospectionResponse.inactive();
        }

        String sessionMode = "DURESS".equalsIgnoreCase(session.getSessionMode())
                ? "DURESS"
                : "NORMAL";

        /*
         * Duress Mode is a paid entitlement. Re-check it at token
         * introspection time so an expired or downgraded account cannot keep an
         * old decoy session alive indefinitely. Safety alerts already queued by
         * that session are intentionally unaffected.
         */
        if ("DURESS".equals(sessionMode) && !hasActiveDuressEntitlement(user)) {
            session.setActive(false);
            session.setRevokedAt(LocalDateTime.now());
            userSessionRepository.save(session);
            return TokenIntrospectionResponse.inactive();
        }

        SecurityIncidentService.LockdownAccessSnapshot lockdown =
                securityIncidentService.accessSnapshot(user.getId(), tokenId, sessionMode);

        return new TokenIntrospectionResponse(
                true,
                user.getId(),
                user.getEmail(),
                user.getFullName(),
                sessionMode,
                lockdown.active(),
                lockdown.recoveryAuthorized()
        );
    }

    private boolean hasActiveDuressEntitlement(User user) {
        Subscription subscription = subscriptionRepository.findByUser(user).orElse(null);
        if (subscription == null
                || !subscription.isActive()
                || subscription.getPlan() == null
                || subscription.getPlan() == SubscriptionPlan.FREE) {
            return false;
        }
        return subscription.getExpiresAt() == null
                || !subscription.getExpiresAt().isBefore(LocalDateTime.now());
    }

    private void requireValidInternalKey(String suppliedKey) {
        byte[] supplied = suppliedKey == null
                ? new byte[0]
                : suppliedKey.getBytes(StandardCharsets.UTF_8);

        if (!MessageDigest.isEqual(expectedInternalKey, supplied)) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Invalid internal service key.");
        }
    }
}
