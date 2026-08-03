package com.vault.theguardian.auth;

import com.vault.theguardian.biometric.BiometricCredential;
import com.vault.theguardian.biometric.BiometricCredentialRepository;
import com.vault.theguardian.biometric.BiometricEnrollmentResponse;
import com.vault.theguardian.biometric.BiometricLoginRequest;
import com.vault.theguardian.email.EmailService;
import com.vault.theguardian.duress.DuressService;
import com.vault.theguardian.incident.SecurityIncidentService;
import com.vault.theguardian.integration.NotificationClient;
import com.vault.theguardian.registration.PendingRegistration;
import com.vault.theguardian.registration.PendingRegistrationRepository;
import com.vault.theguardian.security.JwtService;
import com.vault.theguardian.session.DeviceSessionService;
import com.vault.theguardian.session.UserSession;
import com.vault.theguardian.subscription.Subscription;
import com.vault.theguardian.subscription.SubscriptionPlan;
import com.vault.theguardian.subscription.SubscriptionRepository;
import com.vault.theguardian.user.User;
import com.vault.theguardian.user.UserRepository;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.http.HttpStatus;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.time.LocalDateTime;
import java.util.Base64;
import java.util.HexFormat;
import java.util.List;

@Service
public class AuthService {
    private static final int CODE_MIN = 100000;
    private static final int CODE_MAX = 999999;
    private static final int REGISTRATION_CODE_EXPIRY_MINUTES = 15;
    private static final int BIOMETRIC_CREDENTIAL_EXPIRY_DAYS = 180;
    private static final String DEVICE_ID_HEADER = "X-Guardian-Device-Id";

    private final UserRepository userRepository;
    private final PendingRegistrationRepository pendingRegistrationRepository;
    private final SubscriptionRepository subscriptionRepository;
    private final PasswordEncoder passwordEncoder;
    private final JwtService jwtService;
    private final EmailService emailService;
    private final NotificationClient notificationClient;
    private final DeviceSessionService deviceSessionService;
    private final BiometricCredentialRepository biometricCredentialRepository;
    private final DuressService duressService;
    private final SecurityIncidentService securityIncidentService;
    private final SecureRandom secureRandom = new SecureRandom();

    public AuthService(
            UserRepository userRepository,
            PendingRegistrationRepository pendingRegistrationRepository,
            SubscriptionRepository subscriptionRepository,
            PasswordEncoder passwordEncoder,
            JwtService jwtService,
            EmailService emailService,
            NotificationClient notificationClient,
            DeviceSessionService deviceSessionService,
            BiometricCredentialRepository biometricCredentialRepository,
            DuressService duressService,
            SecurityIncidentService securityIncidentService
    ) {
        this.userRepository = userRepository;
        this.pendingRegistrationRepository = pendingRegistrationRepository;
        this.subscriptionRepository = subscriptionRepository;
        this.passwordEncoder = passwordEncoder;
        this.jwtService = jwtService;
        this.emailService = emailService;
        this.notificationClient = notificationClient;
        this.deviceSessionService = deviceSessionService;
        this.biometricCredentialRepository = biometricCredentialRepository;
        this.duressService = duressService;
        this.securityIncidentService = securityIncidentService;
    }

    /**
     * Creates or refreshes a temporary registration only.
     *
     * Security properties:
     * - no row is inserted into users;
     * - no subscription, session, welcome notification, or JWT is created;
     * - the master password is BCrypt-encoded before storage;
     * - the email verification code is also BCrypt-hashed before storage.
     */
    public RegistrationStartResponse startRegistration(RegisterRequest request) {
        String cleanEmail = normalizeEmail(request.email());

        if (userRepository.findByEmail(cleanEmail).isPresent()) {
            throw new ResponseStatusException(
                    HttpStatus.CONFLICT,
                    "An account already exists with this email. Please sign in instead."
            );
        }

        String code = generateCode();
        LocalDateTime now = LocalDateTime.now();
        LocalDateTime expiresAt = now.plusMinutes(REGISTRATION_CODE_EXPIRY_MINUTES);

        PendingRegistration pending = pendingRegistrationRepository
                .findByEmail(cleanEmail)
                .orElseGet(PendingRegistration::new);

        if (pending.getCreatedAt() == null) {
            pending.setCreatedAt(now);
        }

        pending.setFullName(request.fullname().trim());
        pending.setEmail(cleanEmail);
        pending.setPasswordHash(passwordEncoder.encode(request.password()));
        pending.setVerificationCodeHash(passwordEncoder.encode(code));
        pending.setVerificationCodeExpiresAt(expiresAt);
        pending.setUpdatedAt(now);

        pendingRegistrationRepository.save(pending);

        sendRegistrationVerificationEmailOrThrow(cleanEmail, code);

        return new RegistrationStartResponse(
                cleanEmail,
                "Verification code sent. Your account will be created after the code is confirmed.",
                expiresAt,
                true
        );
    }

    /**
     * Converts one locked pending-registration row into a real account.
     * Everything database-related is committed atomically.
     */
    @Transactional
    public AuthResponse verifyRegistration(
            VerifyEmailRequest request,
            HttpServletRequest httpRequest
    ) {
        String cleanEmail = normalizeEmail(request.email());

        PendingRegistration pending = pendingRegistrationRepository
                .findByEmailForUpdate(cleanEmail)
                .orElseThrow(() -> new ResponseStatusException(
                        HttpStatus.NOT_FOUND,
                        "No pending registration was found. Please return to Sign Up and start again."
                ));

        if (userRepository.findByEmail(cleanEmail).isPresent()) {
            pendingRegistrationRepository.delete(pending);
            throw new ResponseStatusException(
                    HttpStatus.CONFLICT,
                    "This account has already been created. Please sign in."
            );
        }

        if (pending.getVerificationCodeExpiresAt() == null ||
                LocalDateTime.now().isAfter(pending.getVerificationCodeExpiresAt())) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST,
                    "Verification code has expired. Please request a new code."
            );
        }

        String cleanCode = request.code().trim();
        if (!passwordEncoder.matches(cleanCode, pending.getVerificationCodeHash())) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST,
                    "Invalid verification code"
            );
        }

        LocalDateTime now = LocalDateTime.now();

        User savedUser = userRepository.save(User.builder()
                .fullName(pending.getFullName())
                .email(pending.getEmail())
                .passwordHash(pending.getPasswordHash())
                .createdAt(now)
                .emailVerified(true)
                .emailVerificationCode(null)
                .emailVerificationCodeExpiresAt(null)
                .twoFactorEnabled(false)
                .twoFactorCode(null)
                .twoFactorCodeExpiresAt(null)
                .passwordResetCode(null)
                .passwordResetCodeExpiresAt(null)
                .build());

        Subscription savedSubscription = subscriptionRepository.save(Subscription.builder()
                .user(savedUser)
                .plan(SubscriptionPlan.FREE)
                .active(true)
                .startedAt(now)
                .expiresAt(null)
                .build());

        pendingRegistrationRepository.delete(pending);

        UserSession session = deviceSessionService.createLoginSession(
                savedUser,
                httpRequest,
                hasMultipleDeviceAccess(savedSubscription),
                false
        );

        String token = jwtService.generateToken(savedUser.getEmail(), session.getTokenId());

        /* NotificationClient publishes after this transaction commits. */
        notificationClient.notifyWelcome(savedUser);

        return toAuthResponse(savedUser, savedSubscription, token, false);
    }

    public MessageResponse resendRegistrationCode(ResendVerificationRequest request) {
        String cleanEmail = normalizeEmail(request.email());

        if (userRepository.findByEmail(cleanEmail).isPresent()) {
            throw new ResponseStatusException(
                    HttpStatus.CONFLICT,
                    "This account has already been created. Please sign in."
            );
        }

        PendingRegistration pending = pendingRegistrationRepository
                .findByEmail(cleanEmail)
                .orElseThrow(() -> new ResponseStatusException(
                        HttpStatus.NOT_FOUND,
                        "No pending registration was found. Please return to Sign Up and start again."
                ));

        String code = generateCode();
        LocalDateTime now = LocalDateTime.now();

        pending.setVerificationCodeHash(passwordEncoder.encode(code));
        pending.setVerificationCodeExpiresAt(now.plusMinutes(REGISTRATION_CODE_EXPIRY_MINUTES));
        pending.setUpdatedAt(now);
        pendingRegistrationRepository.save(pending);

        sendRegistrationVerificationEmailOrThrow(cleanEmail, code);

        return new MessageResponse(
                "A new registration verification code has been sent."
        );
    }

    public AuthResponse login(LoginRequest request, HttpServletRequest httpRequest) {
        String cleanEmail = normalizeEmail(request.email());

        User user = userRepository.findByEmail(cleanEmail).orElse(null);

        if (user == null) {
            if (pendingRegistrationRepository.existsByEmail(cleanEmail)) {
                throw new ResponseStatusException(
                        HttpStatus.FORBIDDEN,
                        "Finish email verification to complete your account before signing in."
                );
            }

            throw new RuntimeException("Invalid email or password");
        }

        /*
         * Email verification is checked before both normal and duress password
         * handling. A legacy unverified account must not gain a duress session.
         */
        if (!user.isEmailVerified()) {
            throw new ResponseStatusException(
                    HttpStatus.FORBIDDEN,
                    "Verify your email before signing in."
            );
        }

        boolean passwordMatches = passwordEncoder.matches(request.password(), user.getPasswordHash());

        if (!passwordMatches) {
            if (duressService.matchesEnabledDuressPassword(user, request.password())) {
                Subscription duressSubscription = subscriptionRepository.findByUser(user)
                        .orElseThrow(() -> new RuntimeException("Subscription not found"));
                duressSubscription = refreshExpiredSubscription(duressSubscription);

                UserSession duressSession = deviceSessionService.createLoginSession(
                        user,
                        httpRequest,
                        true,
                        false,
                        "DURESS"
                );
                String duressToken = jwtService.generateToken(
                        user.getEmail(),
                        duressSession.getTokenId()
                );
                duressService.scheduleAlertForDuressLogin(user, duressSession.getTokenId());
                return toAuthResponse(user, duressSubscription, duressToken, false, "DURESS");
            }
            throw new RuntimeException("Invalid email or password");
        }

        securityIncidentService.requireLoginFromSafeDevice(user, httpRequest);

        Subscription subscription = subscriptionRepository.findByUser(user)
                .orElseThrow(() -> new RuntimeException("Subscription not found"));

        subscription = refreshExpiredSubscription(subscription);

        if (user.isTwoFactorEnabled()) {
            String code = generateCode();

            user.setTwoFactorCode(code);
            user.setTwoFactorCodeExpiresAt(LocalDateTime.now().plusMinutes(10));

            userRepository.save(user);

            trySendTwoFactorEmail(user.getEmail(), code);

            return toAuthResponse(user, subscription, null, true);
        }

        UserSession session = deviceSessionService.createLoginSession(
                user,
                httpRequest,
                hasMultipleDeviceAccess(subscription),
                request.shouldForceReplaceDevice()
        );

        securityIncidentService.refreshSafeSessionAfterLogin(user, session);

        String token = jwtService.generateToken(user.getEmail(), session.getTokenId());
        duressService.cancelPendingAlerts(user);
        deviceSessionService.revokeDuressSessions(user);

        return toAuthResponse(user, subscription, token, false);
    }

    public AuthResponse verifyTwoFactor(VerifyTwoFactorRequest request, HttpServletRequest httpRequest) {
        String cleanEmail = normalizeEmail(request.email());

        User user = userRepository.findByEmail(cleanEmail)
                .orElseThrow(() -> new RuntimeException("Invalid email or 2FA code"));

        if (!user.isEmailVerified()) {
            throw new ResponseStatusException(
                    HttpStatus.FORBIDDEN,
                    "Verify your email before signing in."
            );
        }

        if (!user.isTwoFactorEnabled()) {
            throw new RuntimeException("2FA is not enabled for this account");
        }

        if (user.getTwoFactorCode() == null || user.getTwoFactorCodeExpiresAt() == null) {
            throw new RuntimeException("No 2FA code found. Please log in again.");
        }

        if (LocalDateTime.now().isAfter(user.getTwoFactorCodeExpiresAt())) {
            throw new RuntimeException("2FA code has expired. Please log in again.");
        }

        if (!user.getTwoFactorCode().equals(request.code().trim())) {
            throw new RuntimeException("Invalid 2FA code");
        }

        /*
         * During Incident Lockdown, reject a correct 2FA code from any device
         * other than the designated recovery device before consuming the code.
         * Otherwise an attacker could repeatedly invalidate the owner's valid
         * recovery code without ever being allowed to sign in.
         */
        securityIncidentService.requireLoginFromSafeDevice(user, httpRequest);

        user.setTwoFactorCode(null);
        user.setTwoFactorCodeExpiresAt(null);

        userRepository.save(user);

        Subscription subscription = subscriptionRepository.findByUser(user)
                .orElseThrow(() -> new RuntimeException("Subscription not found"));

        subscription = refreshExpiredSubscription(subscription);

        UserSession session = deviceSessionService.createLoginSession(
                user,
                httpRequest,
                hasMultipleDeviceAccess(subscription),
                false
        );
        securityIncidentService.refreshSafeSessionAfterLogin(user, session);

        String token = jwtService.generateToken(user.getEmail(), session.getTokenId());
        duressService.cancelPendingAlerts(user);
        deviceSessionService.revokeDuressSessions(user);

        return toAuthResponse(user, subscription, token, false);
    }

    @Transactional
    public BiometricEnrollmentResponse enrollBiometricCredential(
            User user,
            HttpServletRequest httpRequest
    ) {
        String deviceIdHash = resolveDeviceIdHash(httpRequest);
        LocalDateTime now = LocalDateTime.now();

        revokeCredentials(
                biometricCredentialRepository
                        .findByUserAndDeviceIdHashAndRevokedAtIsNull(user, deviceIdHash),
                now
        );

        byte[] tokenBytes = new byte[32];
        secureRandom.nextBytes(tokenBytes);
        String rawToken = Base64.getUrlEncoder().withoutPadding().encodeToString(tokenBytes);
        LocalDateTime expiresAt = now.plusDays(BIOMETRIC_CREDENTIAL_EXPIRY_DAYS);

        biometricCredentialRepository.save(BiometricCredential.builder()
                .user(user)
                .tokenHash(sha256(rawToken))
                .deviceIdHash(deviceIdHash)
                .createdAt(now)
                .lastUsedAt(null)
                .expiresAt(expiresAt)
                .revokedAt(null)
                .build());

        return new BiometricEnrollmentResponse(rawToken, expiresAt);
    }

    @Transactional
    public MessageResponse revokeBiometricCredential(
            User user,
            HttpServletRequest httpRequest
    ) {
        revokeCredentials(
                biometricCredentialRepository.findByUserAndDeviceIdHashAndRevokedAtIsNull(
                        user,
                        resolveDeviceIdHash(httpRequest)
                ),
                LocalDateTime.now()
        );

        return new MessageResponse("Biometric sign-in has been disabled for this device.");
    }

    @Transactional
    public AuthResponse biometricLogin(
            BiometricLoginRequest request,
            HttpServletRequest httpRequest
    ) {
        String cleanEmail = normalizeEmail(request.email());
        User user = userRepository.findByEmail(cleanEmail)
                .orElseThrow(() -> new ResponseStatusException(
                        HttpStatus.UNAUTHORIZED,
                        "Biometric sign-in is no longer available. Sign in with your password again."
                ));

        if (!user.isEmailVerified()) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Verify your email before signing in.");
        }

        securityIncidentService.requireLoginFromSafeDevice(user, httpRequest);
        if (securityIncidentService.isActiveLockdown(user.getId())) {
            throw securityIncidentService.locked(
                    "Biometric sign-in is disabled during Incident Lockdown. Use the master password on the recovery device."
            );
        }

        BiometricCredential credential = biometricCredentialRepository
                .findByTokenHashAndRevokedAtIsNull(sha256(request.credentialToken().trim()))
                .orElseThrow(() -> new ResponseStatusException(
                        HttpStatus.UNAUTHORIZED,
                        "Biometric sign-in is no longer available. Sign in with your password again."
                ));

        LocalDateTime now = LocalDateTime.now();
        boolean wrongUser = credential.getUser() == null
                || !credential.getUser().getId().equals(user.getId());
        boolean wrongDevice = !credential.getDeviceIdHash().equals(resolveDeviceIdHash(httpRequest));
        boolean expired = credential.getExpiresAt() == null || now.isAfter(credential.getExpiresAt());

        if (wrongUser || wrongDevice || expired) {
            credential.setRevokedAt(now);
            biometricCredentialRepository.save(credential);
            throw new ResponseStatusException(
                    HttpStatus.UNAUTHORIZED,
                    "Biometric sign-in is no longer available. Sign in with your password again."
            );
        }

        credential.setLastUsedAt(now);
        biometricCredentialRepository.save(credential);

        Subscription subscription = subscriptionRepository.findByUser(user)
                .orElseThrow(() -> new RuntimeException("Subscription not found"));
        subscription = refreshExpiredSubscription(subscription);

        if (user.isTwoFactorEnabled()) {
            String code = generateCode();
            user.setTwoFactorCode(code);
            user.setTwoFactorCodeExpiresAt(now.plusMinutes(10));
            userRepository.save(user);
            trySendTwoFactorEmail(user.getEmail(), code);
            return toAuthResponse(user, subscription, null, true);
        }

        UserSession session = deviceSessionService.createLoginSession(
                user,
                httpRequest,
                hasMultipleDeviceAccess(subscription),
                false
        );
        String token = jwtService.generateToken(user.getEmail(), session.getTokenId());
        return toAuthResponse(user, subscription, token, false);
    }

    public SecuritySettingsResponse getSecuritySettings(User user) {
        return new SecuritySettingsResponse(
                user.isEmailVerified(),
                user.isTwoFactorEnabled()
        );
    }

    public SecuritySettingsResponse setTwoFactorEnabled(User user, TwoFactorToggleRequest request) {
        if (request.enabled() && !user.isEmailVerified()) {
            throw new RuntimeException("Please verify your email before enabling 2FA.");
        }

        boolean changed = user.isTwoFactorEnabled() != request.enabled();

        user.setTwoFactorEnabled(request.enabled());
        user.setTwoFactorCode(null);
        user.setTwoFactorCodeExpiresAt(null);

        User saved = userRepository.save(user);

        if (changed) {
            if (saved.isTwoFactorEnabled()) {
                notificationClient.notifyTwoFactorEnabled(saved);
            } else {
                notificationClient.notifyTwoFactorDisabled(saved);
            }
        }

        return new SecuritySettingsResponse(
                saved.isEmailVerified(),
                saved.isTwoFactorEnabled()
        );
    }

    /** Legacy verification for accounts created before pending registrations. */
    public MessageResponse verifyEmail(VerifyEmailRequest request) {
        String cleanEmail = normalizeEmail(request.email());

        User user = userRepository.findByEmail(cleanEmail)
                .orElseThrow(() -> new RuntimeException("User not found"));

        if (user.isEmailVerified()) {
            return new MessageResponse("Email is already verified");
        }

        if (user.getEmailVerificationCode() == null || user.getEmailVerificationCodeExpiresAt() == null) {
            throw new RuntimeException("No verification code found. Please request a new code.");
        }

        if (LocalDateTime.now().isAfter(user.getEmailVerificationCodeExpiresAt())) {
            throw new RuntimeException("Verification code has expired. Please request a new code.");
        }

        if (!user.getEmailVerificationCode().equals(request.code().trim())) {
            throw new RuntimeException("Invalid verification code");
        }

        user.setEmailVerified(true);
        user.setEmailVerificationCode(null);
        user.setEmailVerificationCodeExpiresAt(null);

        userRepository.save(user);

        return new MessageResponse("Email verified successfully");
    }

    /** Legacy resend for accounts created before pending registrations. */
    public MessageResponse resendVerificationCode(ResendVerificationRequest request) {
        String cleanEmail = normalizeEmail(request.email());

        User user = userRepository.findByEmail(cleanEmail)
                .orElseThrow(() -> new RuntimeException("User not found"));

        if (user.isEmailVerified()) {
            return new MessageResponse("Email is already verified");
        }

        String code = generateCode();

        user.setEmailVerificationCode(code);
        user.setEmailVerificationCodeExpiresAt(LocalDateTime.now().plusMinutes(15));

        userRepository.save(user);

        trySendVerificationEmail(user.getEmail(), code);

        return new MessageResponse("Verification code sent");
    }

    public MessageResponse forgotPassword(ForgotPasswordRequest request) {
        String cleanEmail = normalizeEmail(request.email());

        User user = userRepository.findByEmail(cleanEmail).orElse(null);

        if (user == null) {
            return new MessageResponse("If this email exists and is verified, an account reset code has been sent.");
        }

        if (!user.isEmailVerified()) {
            throw new RuntimeException("Please verify your email before resetting your account.");
        }

        String resetCode = generateCode();

        user.setPasswordResetCode(resetCode);
        user.setPasswordResetCodeExpiresAt(LocalDateTime.now().plusMinutes(15));

        userRepository.save(user);

        trySendPasswordResetEmail(user.getEmail(), resetCode);

        return new MessageResponse("If this email exists and is verified, an account reset code has been sent.");
    }

    public MessageResponse resetPassword(ResetPasswordRequest request) {
        throw new RuntimeException("Email-only password reset is disabled. Use your Recovery Kit to reset your password safely, or choose Reset & Erase to reset the account and permanently delete old vault data.");
    }

    private AuthResponse toAuthResponse(
            User user,
            Subscription subscription,
            String token,
            boolean requiresTwoFactor
    ) {
        return toAuthResponse(user, subscription, token, requiresTwoFactor, "NORMAL");
    }

    private AuthResponse toAuthResponse(
            User user,
            Subscription subscription,
            String token,
            boolean requiresTwoFactor,
            String sessionMode
    ) {
        return new AuthResponse(
                token,
                user.getId(),
                user.getFullName(),
                user.getEmail(),
                subscription.getPlan().name(),
                user.isEmailVerified(),
                user.isTwoFactorEnabled(),
                requiresTwoFactor,
                "DURESS".equalsIgnoreCase(sessionMode) ? "DURESS" : "NORMAL"
        );
    }

    private boolean hasMultipleDeviceAccess(Subscription subscription) {
        if (subscription == null || subscription.getPlan() == null) {
            return false;
        }

        if (!subscription.isActive()) {
            return false;
        }

        if (
                subscription.getExpiresAt() != null &&
                        subscription.getExpiresAt().isBefore(LocalDateTime.now())
        ) {
            return false;
        }

        return subscription.getPlan() == SubscriptionPlan.PREMIUM
                || subscription.getPlan() == SubscriptionPlan.FAMILY;
    }

    private Subscription refreshExpiredSubscription(Subscription subscription) {
        if (
                subscription.isActive() &&
                        subscription.getExpiresAt() != null &&
                        subscription.getExpiresAt().isBefore(LocalDateTime.now())
        ) {
            subscription.setPlan(SubscriptionPlan.FREE);
            subscription.setActive(false);

            return subscriptionRepository.save(subscription);
        }

        return subscription;
    }

    private String resolveDeviceIdHash(HttpServletRequest request) {
        String rawDeviceId = request == null ? "" : request.getHeader(DEVICE_ID_HEADER);
        if (rawDeviceId == null || rawDeviceId.isBlank()) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST,
                    "This device could not be identified. Restart the app and try again."
            );
        }
        return sha256("guardian-device:" + rawDeviceId.trim());
    }

    private void revokeCredentials(List<BiometricCredential> credentials, LocalDateTime revokedAt) {
        if (credentials == null || credentials.isEmpty()) return;
        for (BiometricCredential credential : credentials) {
            credential.setRevokedAt(revokedAt);
        }
        biometricCredentialRepository.saveAll(credentials);
    }

    private String sha256(String value) {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            byte[] hashed = digest.digest(value.getBytes(StandardCharsets.UTF_8));
            return HexFormat.of().formatHex(hashed);
        } catch (Exception error) {
            throw new IllegalStateException("Could not protect biometric credential.", error);
        }
    }

    private String generateCode() {
        return String.valueOf(
                secureRandom.nextInt(CODE_MAX - CODE_MIN + 1) + CODE_MIN
        );
    }

    private String normalizeEmail(String email) {
        return email.trim().toLowerCase();
    }

    private void sendRegistrationVerificationEmailOrThrow(String email, String code) {
        boolean sent = emailService.sendRegistrationVerificationCode(email, code);

        if (!sent) {
            throw new ResponseStatusException(
                    HttpStatus.SERVICE_UNAVAILABLE,
                    "We could not send the verification email. No account has been created. Please try again."
            );
        }
    }

    private void trySendVerificationEmail(String email, String code) {
        try {
            boolean sent = emailService.sendEmailVerificationCode(email, code);
            if (!sent) {
                System.out.println("EMAIL SEND FAILED for legacy verification email: " + email);
            }
        } catch (Exception e) {
            System.out.println("EMAIL SEND FAILED for legacy verification email: " + email);
            System.out.println("Email error: " + e.getMessage());
        }
    }

    private void trySendTwoFactorEmail(String email, String code) {
        try {
            boolean sent = emailService.sendTwoFactorCode(email, code);
            if (!sent) {
                System.out.println("EMAIL SEND FAILED for 2FA email: " + email);
            }
        } catch (Exception e) {
            System.out.println("EMAIL SEND FAILED for 2FA email: " + email);
            System.out.println("Email error: " + e.getMessage());
        }
    }

    private void trySendPasswordResetEmail(String email, String code) {
        try {
            boolean sent = emailService.sendPasswordResetCode(email, code);
            if (!sent) {
                System.out.println("EMAIL SEND FAILED for password reset email: " + email);
            }
        } catch (Exception e) {
            System.out.println("EMAIL SEND FAILED for password reset email: " + email);
            System.out.println("Email error: " + e.getMessage());
        }
    }
}
