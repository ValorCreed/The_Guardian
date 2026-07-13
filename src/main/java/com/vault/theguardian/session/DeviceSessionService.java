package com.vault.theguardian.session;

import com.vault.theguardian.notification.NotificationService;
import com.vault.theguardian.security.JwtService;
import com.vault.theguardian.user.User;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.transaction.Transactional;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.UUID;

@Service
public class DeviceSessionService {
    private static final String FREE_DEVICE_LIMIT_MESSAGE =
            "Free plan allows only one active device. Upgrade to Premium or Family, or log out from your other device before signing in here.";

    private final UserSessionRepository userSessionRepository;
    private final JwtService jwtService;
    private final NotificationService notificationService;

    public DeviceSessionService(
            UserSessionRepository userSessionRepository,
            JwtService jwtService,
            NotificationService notificationService
    ) {
        this.userSessionRepository = userSessionRepository;
        this.jwtService = jwtService;
        this.notificationService = notificationService;
    }

    /*
     * Backward-compatible overload for any older call sites.
     * AuthService uses the 3-argument method below so plan limits are enforced.
     */
    @Transactional
    public UserSession createLoginSession(User user, HttpServletRequest request) {
        return createLoginSession(user, request, true);
    }

    @Transactional
    public UserSession createLoginSession(User user, HttpServletRequest request, boolean multipleDevicesAllowed) {
        LocalDateTime now = LocalDateTime.now();
        String userAgent = request == null ? "" : safe(request.getHeader("User-Agent"));
        String ipAddress = normalizeIpAddress(extractIpAddress(request));
        String deviceName = resolveDeviceName(userAgent);
        String deviceType = resolveDeviceType(userAgent);

        List<UserSession> matchingActiveSessions =
                userSessionRepository.findByUserAndDeviceTypeAndDeviceNameAndIpAddressAndUserAgentAndActiveTrueOrderByLastSeenAtDesc(
                        user,
                        deviceType,
                        deviceName,
                        ipAddress,
                        userAgent
                );

        if (!matchingActiveSessions.isEmpty()) {
            UserSession primarySession = matchingActiveSessions.get(0);

            primarySession.setTokenId(UUID.randomUUID().toString());
            primarySession.setDeviceName(deviceName);
            primarySession.setDeviceType(deviceType);
            primarySession.setUserAgent(userAgent);
            primarySession.setIpAddress(ipAddress);
            primarySession.setActive(true);
            primarySession.setLastSeenAt(now);
            primarySession.setRevokedAt(null);

            /*
             * Clean up older duplicate active sessions from the same device and same IP.
             * This prevents the user from seeing many old sessions for the same phone/network.
             */
            for (int index = 1; index < matchingActiveSessions.size(); index++) {
                UserSession duplicate = matchingActiveSessions.get(index);
                duplicate.setActive(false);
                duplicate.setRevokedAt(now);
            }

            userSessionRepository.saveAll(matchingActiveSessions);
            userSessionRepository.flush();

            /*
             * Do not send a NEW_DEVICE_LOGIN notification here.
             * Same device + same IP is treated as the same trusted session.
             */
            return primarySession;
        }

        /*
         * FREE plan rule:
         * Same device + same IP is allowed because it updates the existing trusted session above.
         * A different device OR the same device on a different IP counts as another session.
         */
        if (!multipleDevicesAllowed) {
            collapseDuplicateActiveSessions(user, "");

            long activeSessionCount = userSessionRepository.countByUserAndActiveTrue(user);

            if (activeSessionCount >= 1) {
                throw new ResponseStatusException(HttpStatus.FORBIDDEN, FREE_DEVICE_LIMIT_MESSAGE);
            }
        }

        UserSession session = UserSession.builder()
                .tokenId(UUID.randomUUID().toString())
                .user(user)
                .deviceName(deviceName)
                .deviceType(deviceType)
                .userAgent(userAgent)
                .ipAddress(ipAddress)
                .active(true)
                .createdAt(now)
                .lastSeenAt(now)
                .revokedAt(null)
                .build();

        UserSession saved = userSessionRepository.save(session);

        /*
         * Different device OR same device on a different IP becomes a separate trusted session,
         * so the user should be notified.
         */
        notificationService.notifyNewDeviceLogin(user, deviceName, ipAddress);

        return saved;
    }

    @Transactional
    public List<DeviceSessionResponse> getMySessions(User user, HttpServletRequest request) {
        String currentTokenId = extractCurrentTokenId(request);

        collapseDuplicateActiveSessions(user, currentTokenId);

        return userSessionRepository.findByUserAndActiveTrueOrderByLastSeenAtDesc(user)
                .stream()
                .map(session -> toResponse(session, currentTokenId))
                .toList();
    }

    private void collapseDuplicateActiveSessions(User user, String currentTokenId) {
        List<UserSession> activeSessions = userSessionRepository.findByUserAndActiveTrueOrderByLastSeenAtDesc(user);
        Map<String, List<UserSession>> groupedSessions = new HashMap<>();

        for (UserSession session : activeSessions) {
            groupedSessions
                    .computeIfAbsent(sessionIdentityKey(session), ignored -> new ArrayList<>())
                    .add(session);
        }

        List<UserSession> sessionsToSave = new ArrayList<>();
        LocalDateTime now = LocalDateTime.now();

        for (List<UserSession> group : groupedSessions.values()) {
            if (group.size() <= 1) continue;

            UserSession sessionToKeep = group.stream()
                    .filter(session -> session.getTokenId().equals(currentTokenId))
                    .findFirst()
                    .orElse(group.get(0));

            for (UserSession session : group) {
                if (session.getId().equals(sessionToKeep.getId())) continue;

                session.setActive(false);
                session.setRevokedAt(now);
                sessionsToSave.add(session);
            }
        }

        if (!sessionsToSave.isEmpty()) {
            userSessionRepository.saveAll(sessionsToSave);
            userSessionRepository.flush();
        }
    }

    private String sessionIdentityKey(UserSession session) {
        return String.join(
                "|",
                cleanKey(session.getDeviceType()),
                cleanKey(session.getDeviceName()),
                cleanKey(session.getIpAddress()),
                cleanKey(session.getUserAgent())
        );
    }

    private String cleanKey(String value) {
        return value == null ? "" : value.trim().toLowerCase(Locale.ROOT);
    }

    @Transactional
    public void revokeSession(User user, Long sessionId, HttpServletRequest request) {
        UserSession session = userSessionRepository.findByIdAndUser(sessionId, user)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Device session not found."));

        if (!session.isActive()) return;

        session.setActive(false);
        session.setRevokedAt(LocalDateTime.now());
        userSessionRepository.saveAndFlush(session);
        notificationService.notifySessionRevoked(user, session.getDeviceName());
    }

    @Transactional
    public void revokeOtherSessions(User user, HttpServletRequest request) {
        String currentTokenId = extractCurrentTokenId(request);

        List<UserSession> sessions = userSessionRepository.findByUserAndActiveTrue(user);
        LocalDateTime now = LocalDateTime.now();

        for (UserSession session : sessions) {
            if (session.getTokenId().equals(currentTokenId)) continue;

            session.setActive(false);
            session.setRevokedAt(now);
        }

        userSessionRepository.saveAll(sessions);
        userSessionRepository.flush();
    }

    @Transactional
    public void revokeAllSessions(User user) {
        List<UserSession> sessions = userSessionRepository.findByUserAndActiveTrue(user);
        LocalDateTime now = LocalDateTime.now();

        for (UserSession session : sessions) {
            session.setActive(false);
            session.setRevokedAt(now);
        }

        userSessionRepository.saveAll(sessions);
        userSessionRepository.flush();
    }

    private DeviceSessionResponse toResponse(UserSession session, String currentTokenId) {
        return new DeviceSessionResponse(
                session.getId(),
                session.getDeviceName(),
                session.getDeviceType(),
                session.getIpAddress(),
                session.isActive(),
                session.getTokenId().equals(currentTokenId),
                session.getCreatedAt(),
                session.getLastSeenAt(),
                session.getRevokedAt()
        );
    }

    private String extractCurrentTokenId(HttpServletRequest request) {
        if (request == null) return "";

        String authHeader = request.getHeader("Authorization");

        if (authHeader == null || !authHeader.startsWith("Bearer ")) return "";

        String token = authHeader.substring(7);

        try {
            return jwtService.extractTokenId(token);
        } catch (Exception e) {
            return "";
        }
    }

    private String extractIpAddress(HttpServletRequest request) {
        if (request == null) return "Unknown";

        String forwardedFor = request.getHeader("X-Forwarded-For");

        if (forwardedFor != null && !forwardedFor.isBlank()) {
            return forwardedFor.split(",")[0].trim();
        }

        String realIp = request.getHeader("X-Real-IP");

        if (realIp != null && !realIp.isBlank()) {
            return realIp.trim();
        }

        String remoteAddr = request.getRemoteAddr();
        return remoteAddr == null || remoteAddr.isBlank() ? "Unknown" : remoteAddr;
    }

    private String normalizeIpAddress(String value) {
        if (value == null || value.isBlank()) return "Unknown";
        return value.trim();
    }

    private String resolveDeviceType(String userAgent) {
        String lower = userAgent.toLowerCase(Locale.ROOT);

        if (lower.contains("android")) return "Android";
        if (lower.contains("iphone") || lower.contains("ipad") || lower.contains("ios")) return "iOS";
        if (lower.contains("windows")) return "Windows";
        if (lower.contains("mac os") || lower.contains("macintosh")) return "Mac";
        if (lower.contains("linux")) return "Linux";

        return "Unknown";
    }

    private String resolveDeviceName(String userAgent) {
        String lower = userAgent.toLowerCase(Locale.ROOT);

        if (lower.contains("expo")) return "Expo app";
        if (lower.contains("okhttp")) return "Android app";
        if (lower.contains("iphone")) return "iPhone";
        if (lower.contains("ipad")) return "iPad";
        if (lower.contains("android")) return "Android device";
        if (lower.contains("windows")) return "Windows device";
        if (lower.contains("macintosh") || lower.contains("mac os")) return "Mac device";

        return "Trusted device";
    }

    private String safe(String value) {
        if (value == null) return "";
        return value.length() > 1100 ? value.substring(0, 1100) : value;
    }
}
