package com.vault.theguardian.auth;

import com.vault.theguardian.email.EmailService;
import com.vault.theguardian.notification.NotificationService;
import com.vault.theguardian.security.JwtService;
import com.vault.theguardian.session.DeviceSessionService;
import com.vault.theguardian.session.UserSession;
import com.vault.theguardian.subscription.Subscription;
import com.vault.theguardian.subscription.SubscriptionPlan;
import com.vault.theguardian.subscription.SubscriptionRepository;
import com.vault.theguardian.user.User;
import com.vault.theguardian.user.UserRepository;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;

import java.security.SecureRandom;
import java.time.LocalDateTime;

@Service
public class AuthService {
    private static final int CODE_MIN = 100000;
    private static final int CODE_MAX = 999999;

    private final UserRepository userRepository;
    private final SubscriptionRepository subscriptionRepository;
    private final PasswordEncoder passwordEncoder;
    private final JwtService jwtService;
    private final EmailService emailService;
    private final NotificationService notificationService;
    private final DeviceSessionService deviceSessionService;
    private final SecureRandom secureRandom = new SecureRandom();

    public AuthService(
            UserRepository userRepository,
            SubscriptionRepository subscriptionRepository,
            PasswordEncoder passwordEncoder,
            JwtService jwtService,
            EmailService emailService,
            NotificationService notificationService,
            DeviceSessionService deviceSessionService
    ) {
        this.userRepository = userRepository;
        this.subscriptionRepository = subscriptionRepository;
        this.passwordEncoder = passwordEncoder;
        this.jwtService = jwtService;
        this.emailService = emailService;
        this.notificationService = notificationService;
        this.deviceSessionService = deviceSessionService;
    }

    public AuthResponse register(RegisterRequest request, HttpServletRequest httpRequest) {
        String cleanEmail = request.email().trim().toLowerCase();

        if (userRepository.findByEmail(cleanEmail).isPresent()) {
            throw new RuntimeException("Email already exists");
        }

        String verificationCode = generateCode();

        User user = User.builder()
                .fullName(request.fullname().trim())
                .email(cleanEmail)
                .passwordHash(passwordEncoder.encode(request.password()))
                .createdAt(LocalDateTime.now())
                .emailVerified(false)
                .emailVerificationCode(verificationCode)
                .emailVerificationCodeExpiresAt(LocalDateTime.now().plusMinutes(15))
                .twoFactorEnabled(false)
                .twoFactorCode(null)
                .twoFactorCodeExpiresAt(null)
                .passwordResetCode(null)
                .passwordResetCodeExpiresAt(null)
                .build();

        User savedUser = userRepository.save(user);

        Subscription subscription = Subscription.builder()
                .user(savedUser)
                .plan(SubscriptionPlan.FREE)
                .active(true)
                .startedAt(LocalDateTime.now())
                .expiresAt(null)
                .build();

        Subscription savedSubscription = subscriptionRepository.save(subscription);

        notificationService.notifyWelcome(savedUser);

        trySendVerificationEmail(savedUser.getEmail(), verificationCode);

        UserSession session = deviceSessionService.createLoginSession(
                savedUser,
                httpRequest,
                hasMultipleDeviceAccess(savedSubscription)
        );

        String token = jwtService.generateToken(savedUser.getEmail(), session.getTokenId());

        return toAuthResponse(savedUser, savedSubscription, token, false);
    }

    public AuthResponse login(LoginRequest request, HttpServletRequest httpRequest) {
        String cleanEmail = request.email().trim().toLowerCase();

        User user = userRepository.findByEmail(cleanEmail)
                .orElseThrow(() -> new RuntimeException("Invalid email or password"));

        boolean passwordMatches = passwordEncoder.matches(request.password(), user.getPasswordHash());

        if (!passwordMatches) {
            throw new RuntimeException("Invalid email or password");
        }

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
                hasMultipleDeviceAccess(subscription)
        );

        String token = jwtService.generateToken(user.getEmail(), session.getTokenId());

        return toAuthResponse(user, subscription, token, false);
    }

    public AuthResponse verifyTwoFactor(VerifyTwoFactorRequest request, HttpServletRequest httpRequest) {
        String cleanEmail = request.email().trim().toLowerCase();

        User user = userRepository.findByEmail(cleanEmail)
                .orElseThrow(() -> new RuntimeException("Invalid email or 2FA code"));

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

        user.setTwoFactorCode(null);
        user.setTwoFactorCodeExpiresAt(null);

        userRepository.save(user);

        Subscription subscription = subscriptionRepository.findByUser(user)
                .orElseThrow(() -> new RuntimeException("Subscription not found"));

        subscription = refreshExpiredSubscription(subscription);

        UserSession session = deviceSessionService.createLoginSession(
                user,
                httpRequest,
                hasMultipleDeviceAccess(subscription)
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

        user.setTwoFactorEnabled(request.enabled());
        user.setTwoFactorCode(null);
        user.setTwoFactorCodeExpiresAt(null);

        User saved = userRepository.save(user);

        return new SecuritySettingsResponse(
                saved.isEmailVerified(),
                saved.isTwoFactorEnabled()
        );
    }

    public MessageResponse verifyEmail(VerifyEmailRequest request) {
        String cleanEmail = request.email().trim().toLowerCase();

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

    public MessageResponse resendVerificationCode(ResendVerificationRequest request) {
        String cleanEmail = request.email().trim().toLowerCase();

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
        String cleanEmail = request.email().trim().toLowerCase();

        User user = userRepository.findByEmail(cleanEmail).orElse(null);

        if (user == null) {
            return new MessageResponse("If this email exists and is verified, a reset code has been sent.");
        }

        if (!user.isEmailVerified()) {
            throw new RuntimeException("Please verify your email before resetting your password.");
        }

        String resetCode = generateCode();

        user.setPasswordResetCode(resetCode);
        user.setPasswordResetCodeExpiresAt(LocalDateTime.now().plusMinutes(15));

        userRepository.save(user);

        trySendPasswordResetEmail(user.getEmail(), resetCode);

        return new MessageResponse("If this email exists and is verified, a reset code has been sent.");
    }

    public MessageResponse resetPassword(ResetPasswordRequest request) {
        String cleanEmail = request.email().trim().toLowerCase();

        User user = userRepository.findByEmail(cleanEmail)
                .orElseThrow(() -> new RuntimeException("Invalid email or reset code"));

        if (!user.isEmailVerified()) {
            throw new RuntimeException("Please verify your email before resetting your password.");
        }

        if (user.getPasswordResetCode() == null || user.getPasswordResetCodeExpiresAt() == null) {
            throw new RuntimeException("No password reset code found. Please request a new code.");
        }

        if (LocalDateTime.now().isAfter(user.getPasswordResetCodeExpiresAt())) {
            throw new RuntimeException("Password reset code has expired. Please request a new code.");
        }

        if (!user.getPasswordResetCode().equals(request.code().trim())) {
            throw new RuntimeException("Invalid password reset code");
        }

        user.setPasswordHash(passwordEncoder.encode(request.newPassword()));
        user.setPasswordResetCode(null);
        user.setPasswordResetCodeExpiresAt(null);

        userRepository.save(user);

        return new MessageResponse("Password reset successfully");
    }

    private AuthResponse toAuthResponse(
            User user,
            Subscription subscription,
            String token,
            boolean requiresTwoFactor
    ) {
        return new AuthResponse(
                token,
                user.getId(),
                user.getFullName(),
                user.getEmail(),
                subscription.getPlan().name(),
                user.isEmailVerified(),
                user.isTwoFactorEnabled(),
                requiresTwoFactor
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

    private String generateCode() {
        return String.valueOf(
                secureRandom.nextInt(CODE_MAX - CODE_MIN + 1) + CODE_MIN
        );
    }

    private void trySendVerificationEmail(String email, String code) {
        try {
            emailService.sendEmailVerificationCode(email, code);
        } catch (Exception e) {
            System.out.println("EMAIL SEND FAILED. Verification code for " + email + " is: " + code);
            System.out.println("Email error: " + e.getMessage());
        }
    }

    private void trySendTwoFactorEmail(String email, String code) {
        try {
            emailService.sendTwoFactorCode(email, code);
        } catch (Exception e) {
            System.out.println("EMAIL SEND FAILED. 2FA code for " + email + " is: " + code);
            System.out.println("Email error: " + e.getMessage());
        }
    }

    private void trySendPasswordResetEmail(String email, String code) {
        try {
            emailService.sendPasswordResetCode(email, code);
        } catch (Exception e) {
            System.out.println("EMAIL SEND FAILED. Password reset code for " + email + " is: " + code);
            System.out.println("Email error: " + e.getMessage());
        }
    }
}