package com.vault.theguardian.session;

import com.vault.theguardian.biometric.BiometricCredential;
import com.vault.theguardian.biometric.BiometricCredentialRepository;
import com.vault.theguardian.integration.NotificationClient;
import com.vault.theguardian.security.JwtService;
import com.vault.theguardian.user.User;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.transaction.Transactional;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

import java.security.MessageDigest;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.HexFormat;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.UUID;

@Service
public class DeviceSessionService {
    public static final String DEVICE_LIMIT_CODE = "DEVICE_LIMIT_REACHED";

    private static final String FREE_DEVICE_LIMIT_MESSAGE =
            DEVICE_LIMIT_CODE + ": Your free plan allows one trusted device at a time. You can remove the previous device and continue on this one.";

    private static final String DEVICE_ID_HEADER = "X-Guardian-Device-Id";
    private static final String DEVICE_NAME_HEADER = "X-Guardian-Device-Name";
    private static final String DEVICE_TYPE_HEADER = "X-Guardian-Device-Type";

    private final UserSessionRepository userSessionRepository;
    private final JwtService jwtService;
    private final NotificationClient notificationClient;
    private final BiometricCredentialRepository biometricCredentialRepository;

    public DeviceSessionService(
            UserSessionRepository userSessionRepository,
            JwtService jwtService,
            NotificationClient notificationClient,
            BiometricCredentialRepository biometricCredentialRepository
    ) {
        this.userSessionRepository = userSessionRepository;
        this.jwtService = jwtService;
        this.notificationClient = notificationClient;
        this.biometricCredentialRepository = biometricCredentialRepository;
    }

    /*
     * Backward-compatible overload for any older call sites.
     * AuthService uses the 4-argument method below so plan limits are enforced.
     */
    @Transactional
    public UserSession createLoginSession(User user, HttpServletRequest request) {
        return createLoginSession(user, request, true, false, "NORMAL");
    }

    @Transactional
    public UserSession createLoginSession(User user, HttpServletRequest request, boolean multipleDevicesAllowed) {
        return createLoginSession(user, request, multipleDevicesAllowed, false, "NORMAL");
    }

    @Transactional
    public UserSession createLoginSession(
            User user,
            HttpServletRequest request,
            boolean multipleDevicesAllowed,
            boolean forceReplaceDevice
    ) {
        return createLoginSession(user, request, multipleDevicesAllowed, forceReplaceDevice, "NORMAL");
    }

    @Transactional
    public UserSession createLoginSession(
            User user,
            HttpServletRequest request,
            boolean multipleDevicesAllowed,
            boolean forceReplaceDevice,
            String requestedSessionMode
    ) {
        String sessionMode = "DURESS".equalsIgnoreCase(requestedSessionMode)
                ? "DURESS"
                : "NORMAL";
        boolean duressSession = "DURESS".equals(sessionMode);
        LocalDateTime now = LocalDateTime.now();

        String userAgent = request == null ? "" : safe(request.getHeader("User-Agent"));
        String ipAddress = normalizeIpAddress(extractIpAddress(request));

        String deviceName = resolveDeviceName(request, userAgent);
        String deviceType = resolveDeviceType(request, userAgent);

        /*
         * This is the important fix:
         * We identify a device by a stable app-generated device ID, not by IP address.
         */
        String rawDeviceId = resolveDeviceId(request, userAgent, deviceName, deviceType);
        String deviceIdHash = sha256(rawDeviceId);

        List<UserSession> matchingActiveSessions =
                userSessionRepository.findByUserAndDeviceIdHashAndSessionModeAndActiveTrueOrderByLastSeenAtDesc(
                        user,
                        deviceIdHash,
                        sessionMode
                );

        if (!matchingActiveSessions.isEmpty()) {
            UserSession primarySession = matchingActiveSessions.get(0);

            primarySession.setTokenId(UUID.randomUUID().toString());
            primarySession.setDeviceIdHash(deviceIdHash);
            primarySession.setDeviceName(deviceName);
            primarySession.setDeviceType(deviceType);
            primarySession.setUserAgent(userAgent);
            primarySession.setIpAddress(ipAddress);
            primarySession.setActive(true);
            primarySession.setSessionMode(sessionMode);
            primarySession.setLastSeenAt(now);
            primarySession.setRevokedAt(null);

            /*
             * Clean up older duplicate active sessions for this same device.
             * Same device on a different IP/network remains the same trusted device.
             */
            for (int index = 1; index < matchingActiveSessions.size(); index++) {
                UserSession duplicate = matchingActiveSessions.get(index);
                duplicate.setActive(false);
                duplicate.setRevokedAt(now);
            }

            userSessionRepository.saveAll(matchingActiveSessions);
            userSessionRepository.flush();

            return primarySession;
        }

        /*
         * FREE plan rule:
         * A different device ID counts as a new trusted device.
         * If the user chooses to continue on this device, forceReplaceDevice revokes the old device.
         */
        if (!duressSession && !multipleDevicesAllowed) {
            collapseDuplicateActiveSessions(user, "");

            long activeSessionCount = userSessionRepository.countByUserAndSessionModeAndActiveTrue(user, "NORMAL");

            if (activeSessionCount >= 1) {
                if (!forceReplaceDevice) {
                    throw new ResponseStatusException(HttpStatus.CONFLICT, FREE_DEVICE_LIMIT_MESSAGE);
                }

                revokeAllActiveSessionsForDeviceReplacement(user);
            }
        }

        UserSession session = UserSession.builder()
                .tokenId(UUID.randomUUID().toString())
                .user(user)
                .deviceIdHash(deviceIdHash)
                .deviceName(deviceName)
                .deviceType(deviceType)
                .userAgent(userAgent)
                .ipAddress(ipAddress)
                .active(true)
                .sessionMode(sessionMode)
                .createdAt(now)
                .lastSeenAt(now)
                .revokedAt(null)
                .build();

        UserSession saved = userSessionRepository.save(session);

        if (!duressSession) {
            notificationClient.notifyNewDeviceLogin(user, deviceName, ipAddress);
        }

        return saved;
    }

    private void revokeAllActiveSessionsForDeviceReplacement(User user) {
        List<UserSession> sessions = userSessionRepository
                .findByUserAndSessionModeAndActiveTrue(user, "NORMAL");
        LocalDateTime now = LocalDateTime.now();

        for (UserSession session : sessions) {
            session.setActive(false);
            session.setRevokedAt(now);
        }

        userSessionRepository.saveAll(sessions);
        userSessionRepository.flush();

        sessions.stream()
                .map(UserSession::getDeviceIdHash)
                .filter(deviceIdHash -> deviceIdHash != null && !deviceIdHash.isBlank())
                .distinct()
                .forEach(deviceIdHash ->
                        revokeBiometricCredentialsForDevice(user, deviceIdHash, now));
    }

    @Transactional
    public List<DeviceSessionResponse> getMySessions(User user, HttpServletRequest request) {
        String currentTokenId = extractCurrentTokenId(request);

        collapseDuplicateActiveSessions(user, currentTokenId);

        return userSessionRepository.findByUserAndActiveTrueOrderByLastSeenAtDesc(user)
                .stream()
                .filter(session -> !"DURESS".equalsIgnoreCase(session.getSessionMode()))
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
        String mode = "DURESS".equalsIgnoreCase(session.getSessionMode()) ? "duress" : "normal";
        if (session.getDeviceIdHash() != null && !session.getDeviceIdHash().isBlank()) {
            return mode + ":device:" + session.getDeviceIdHash().trim().toLowerCase(Locale.ROOT);
        }

        /*
         * Legacy fallback for rows created before V18.
         * Do not include IP address here because IP changes should not create a new device.
         */
        return String.join(
                "|",
                mode,
                cleanKey(session.getDeviceType()),
                cleanKey(session.getDeviceName()),
                cleanKey(session.getUserAgent())
        );
    }

    private String cleanKey(String value) {
        return value == null ? "" : value.trim().toLowerCase(Locale.ROOT);
    }


    @Transactional
    public UserSession requireCurrentNormalSession(User user, HttpServletRequest request) {
        String currentTokenId = extractCurrentTokenId(request);
        if (currentTokenId == null || currentTokenId.isBlank()) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Current session could not be resolved.");
        }

        UserSession session = userSessionRepository.findByTokenIdAndActiveTrue(currentTokenId)
                .orElseThrow(() -> new ResponseStatusException(
                        HttpStatus.UNAUTHORIZED,
                        "Current session could not be resolved."
                ));
        if (session.getUser() == null
                || !session.getUser().getId().equals(user.getId())
                || "DURESS".equalsIgnoreCase(session.getSessionMode())) {
            throw new ResponseStatusException(
                    HttpStatus.FORBIDDEN,
                    "Incident Lockdown can only be started from a normal Guardian session."
            );
        }
        return session;
    }

    @Transactional
    public LockdownSessionResult lockdownToCurrentSession(User user, String safeTokenId) {
        if (safeTokenId == null || safeTokenId.isBlank()) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Safe recovery session is missing.");
        }

        List<UserSession> sessions = userSessionRepository.findByUserAndActiveTrue(user);
        LocalDateTime now = LocalDateTime.now();
        int revokedSessions = 0;

        for (UserSession session : sessions) {
            if (safeTokenId.equals(session.getTokenId())
                    && !"DURESS".equalsIgnoreCase(session.getSessionMode())) {
                continue;
            }
            session.setActive(false);
            session.setRevokedAt(now);
            revokedSessions++;
        }
        if (!sessions.isEmpty()) {
            userSessionRepository.saveAll(sessions);
            userSessionRepository.flush();
        }

        List<BiometricCredential> credentials =
                biometricCredentialRepository.findByUserAndRevokedAtIsNull(user);
        int revokedBiometrics = credentials.size();
        for (BiometricCredential credential : credentials) {
            credential.setRevokedAt(now);
        }
        if (!credentials.isEmpty()) {
            biometricCredentialRepository.saveAll(credentials);
        }

        return new LockdownSessionResult(revokedSessions, revokedBiometrics);
    }

    public String resolveDeviceIdHashForRequest(HttpServletRequest request) {
        String userAgent = request == null ? "" : safe(request.getHeader("User-Agent"));
        String deviceName = resolveDeviceName(request, userAgent);
        String deviceType = resolveDeviceType(request, userAgent);
        return sha256(resolveDeviceId(request, userAgent, deviceName, deviceType));
    }

    @Transactional
    public void revokeSession(User user, Long sessionId, HttpServletRequest request) {
        UserSession session = userSessionRepository.findByIdAndUser(sessionId, user)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Device session not found."));

        if (!session.isActive()) return;

        LocalDateTime now = LocalDateTime.now();
        session.setActive(false);
        session.setRevokedAt(now);
        userSessionRepository.saveAndFlush(session);
        revokeBiometricCredentialsForDevice(user, session.getDeviceIdHash(), now);
        notificationClient.notifySessionRevoked(user, session.getDeviceName());
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

        sessions.stream()
                .filter(session -> !session.getTokenId().equals(currentTokenId))
                .map(UserSession::getDeviceIdHash)
                .distinct()
                .forEach(deviceIdHash -> revokeBiometricCredentialsForDevice(user, deviceIdHash, now));
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

        List<BiometricCredential> credentials =
                biometricCredentialRepository.findByUserAndRevokedAtIsNull(user);
        for (BiometricCredential credential : credentials) {
            credential.setRevokedAt(now);
        }
        if (!credentials.isEmpty()) {
            biometricCredentialRepository.saveAll(credentials);
        }
    }


    @Transactional
    public void revokeDuressSessions(User user) {
        List<UserSession> sessions = userSessionRepository
                .findByUserAndSessionModeAndActiveTrue(user, "DURESS");
        if (sessions.isEmpty()) return;

        LocalDateTime now = LocalDateTime.now();
        for (UserSession session : sessions) {
            session.setActive(false);
            session.setRevokedAt(now);
        }
        userSessionRepository.saveAll(sessions);
        userSessionRepository.flush();
    }

    private void revokeBiometricCredentialsForDevice(
            User user,
            String deviceIdHash,
            LocalDateTime now
    ) {
        if (deviceIdHash == null || deviceIdHash.isBlank()) return;

        List<BiometricCredential> credentials =
                biometricCredentialRepository.findByUserAndDeviceIdHashAndRevokedAtIsNull(
                        user,
                        deviceIdHash
                );
        for (BiometricCredential credential : credentials) {
            credential.setRevokedAt(now);
        }
        if (!credentials.isEmpty()) {
            biometricCredentialRepository.saveAll(credentials);
        }
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

    private String resolveDeviceId(
            HttpServletRequest request,
            String userAgent,
            String deviceName,
            String deviceType
    ) {
        String headerValue = request == null ? "" : safe(request.getHeader(DEVICE_ID_HEADER));

        if (headerValue != null && !headerValue.isBlank()) {
            return "guardian-device:" + headerValue.trim();
        }

        /*
         * Legacy fallback if an older frontend has not been updated yet.
         * This fallback intentionally avoids IP address.
         */
        return "legacy:" + deviceType + "|" + deviceName + "|" + userAgent;
    }

    private String resolveDeviceType(HttpServletRequest request, String userAgent) {
        String headerValue = request == null ? "" : safe(request.getHeader(DEVICE_TYPE_HEADER));

        if (headerValue != null && !headerValue.isBlank()) {
            return headerValue.trim();
        }

        String lower = userAgent.toLowerCase(Locale.ROOT);

        if (lower.contains("android")) return "Android";
        if (lower.contains("iphone") || lower.contains("ipad") || lower.contains("ios")) return "iOS";
        if (lower.contains("windows")) return "Windows";
        if (lower.contains("mac os") || lower.contains("macintosh")) return "Mac";
        if (lower.contains("linux")) return "Linux";

        return "Unknown";
    }

    private String resolveDeviceName(HttpServletRequest request, String userAgent) {
        String headerValue = request == null ? "" : safe(request.getHeader(DEVICE_NAME_HEADER));

        if (headerValue != null && !headerValue.isBlank()) {
            return headerValue.trim();
        }

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

    private String sha256(String value) {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            byte[] hashed = digest.digest(value.getBytes());
            return HexFormat.of().formatHex(hashed);
        } catch (Exception e) {
            throw new RuntimeException("Could not create device session hash.");
        }
    }

    private String safe(String value) {
        if (value == null) return "";
        return value.length() > 1100 ? value.substring(0, 1100) : value;
    }
}
