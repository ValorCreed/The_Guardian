package com.vault.theguardian.internal.recovery;

import com.vault.theguardian.biometric.BiometricCredential;
import com.vault.theguardian.biometric.BiometricCredentialRepository;
import com.vault.theguardian.session.UserSession;
import com.vault.theguardian.session.UserSessionRepository;
import com.vault.theguardian.user.User;
import com.vault.theguardian.user.UserRepository;
import jakarta.transaction.Transactional;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.LocalDateTime;
import java.util.List;

@RestController
@RequestMapping("/internal/recovery")
public class InternalRecoveryController {
    private static final String INTERNAL_KEY_HEADER = "X-Internal-Service-Key";

    private final UserRepository userRepository;
    private final UserSessionRepository userSessionRepository;
    private final BiometricCredentialRepository biometricCredentialRepository;
    private final PasswordEncoder passwordEncoder;
    private final byte[] expectedInternalKey;

    public InternalRecoveryController(
            UserRepository userRepository,
            UserSessionRepository userSessionRepository,
            BiometricCredentialRepository biometricCredentialRepository,
            PasswordEncoder passwordEncoder,
            @Value("${internal.service.key}") String internalServiceKey
    ) {
        if (internalServiceKey == null || internalServiceKey.isBlank()) {
            throw new IllegalStateException("INTERNAL_SERVICE_KEY must be configured.");
        }
        this.userRepository = userRepository;
        this.userSessionRepository = userSessionRepository;
        this.biometricCredentialRepository = biometricCredentialRepository;
        this.passwordEncoder = passwordEncoder;
        this.expectedInternalKey = internalServiceKey.getBytes(StandardCharsets.UTF_8);
    }

    @PostMapping("/users/{userId}/verify-password")
    public PasswordVerificationResponse verifyPassword(
            @RequestHeader(value = INTERNAL_KEY_HEADER, required = false) String suppliedKey,
            @PathVariable Long userId,
            @Valid @RequestBody VerifyPasswordRequest request
    ) {
        requireValidInternalKey(suppliedKey);
        User user = requireUser(userId);
        return new PasswordVerificationResponse(
                passwordEncoder.matches(request.password(), user.getPasswordHash())
        );
    }

    @PostMapping("/account-reset/validate")
    public AccountResetValidationResponse validateAccountReset(
            @RequestHeader(value = INTERNAL_KEY_HEADER, required = false) String suppliedKey,
            @Valid @RequestBody ValidateAccountResetRequest request
    ) {
        requireValidInternalKey(suppliedKey);
        User user = validateResetCode(request.email(), request.resetCode());
        return new AccountResetValidationResponse(user.getId(), user.getEmail());
    }

    @PostMapping("/users/{userId}/reset-password")
    @Transactional
    public void resetPassword(
            @RequestHeader(value = INTERNAL_KEY_HEADER, required = false) String suppliedKey,
            @PathVariable Long userId,
            @Valid @RequestBody ResetPasswordRequest request
    ) {
        requireValidInternalKey(suppliedKey);
        User user = requireUser(userId);
        resetCredentialsAndSessions(user, request.newPassword());
    }

    @PostMapping("/account-reset/complete")
    @Transactional
    public AccountResetValidationResponse completeAccountReset(
            @RequestHeader(value = INTERNAL_KEY_HEADER, required = false) String suppliedKey,
            @Valid @RequestBody CompleteAccountResetRequest request
    ) {
        requireValidInternalKey(suppliedKey);
        User user = validateResetCode(request.email(), request.resetCode());
        resetCredentialsAndSessions(user, request.newPassword());
        return new AccountResetValidationResponse(user.getId(), user.getEmail());
    }

    private User validateResetCode(String email, String resetCode) {
        String cleanEmail = email.trim().toLowerCase();
        String cleanResetCode = resetCode.trim();

        User user = userRepository.findByEmailIgnoreCase(cleanEmail)
                .orElseThrow(() -> new ResponseStatusException(
                        HttpStatus.UNAUTHORIZED,
                        "Invalid email or reset code."
                ));

        if (!user.isEmailVerified()) {
            throw new ResponseStatusException(
                    HttpStatus.FORBIDDEN,
                    "Please verify your email before resetting your account."
            );
        }

        if (user.getPasswordResetCode() == null
                || user.getPasswordResetCodeExpiresAt() == null) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST,
                    "No password reset code found. Request a reset code first."
            );
        }

        if (LocalDateTime.now().isAfter(user.getPasswordResetCodeExpiresAt())) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST,
                    "Password reset code has expired. Request a new code."
            );
        }

        byte[] expected = user.getPasswordResetCode().getBytes(StandardCharsets.UTF_8);
        byte[] supplied = cleanResetCode.getBytes(StandardCharsets.UTF_8);
        if (!MessageDigest.isEqual(expected, supplied)) {
            throw new ResponseStatusException(
                    HttpStatus.UNAUTHORIZED,
                    "Invalid email or reset code."
            );
        }
        return user;
    }

    private void resetCredentialsAndSessions(User user, String newPassword) {
        LocalDateTime now = LocalDateTime.now();
        user.setPasswordHash(passwordEncoder.encode(newPassword));
        user.setPasswordResetCode(null);
        user.setPasswordResetCodeExpiresAt(null);
        user.setTwoFactorCode(null);
        user.setTwoFactorCodeExpiresAt(null);
        userRepository.save(user);

        List<UserSession> activeSessions = userSessionRepository.findByUserAndActiveTrue(user);
        for (UserSession session : activeSessions) {
            session.setActive(false);
            session.setRevokedAt(now);
        }
        if (!activeSessions.isEmpty()) {
            userSessionRepository.saveAll(activeSessions);
            userSessionRepository.flush();
        }

        List<BiometricCredential> biometricCredentials =
                biometricCredentialRepository.findByUserAndRevokedAtIsNull(user);
        for (BiometricCredential credential : biometricCredentials) {
            credential.setRevokedAt(now);
        }
        if (!biometricCredentials.isEmpty()) {
            biometricCredentialRepository.saveAll(biometricCredentials);
        }
    }

    private User requireUser(Long userId) {
        return userRepository.findById(userId)
                .orElseThrow(() -> new ResponseStatusException(
                        HttpStatus.NOT_FOUND,
                        "User account not found."
                ));
    }

    private void requireValidInternalKey(String suppliedKey) {
        byte[] supplied = suppliedKey == null
                ? new byte[0]
                : suppliedKey.getBytes(StandardCharsets.UTF_8);
        if (!MessageDigest.isEqual(expectedInternalKey, supplied)) {
            throw new ResponseStatusException(
                    HttpStatus.FORBIDDEN,
                    "Invalid internal service key."
            );
        }
    }

    public record VerifyPasswordRequest(
            @NotBlank(message = "Password is required") String password
    ) {}

    public record PasswordVerificationResponse(boolean valid) {}

    public record ValidateAccountResetRequest(
            @NotBlank(message = "Email is required")
            @Email(message = "Enter a valid email")
            String email,
            @NotBlank(message = "Reset code is required")
            String resetCode
    ) {}

    public record ResetPasswordRequest(
            @NotBlank(message = "New password is required")
            @Size(min = 8, message = "Password must be at least 8 characters")
            String newPassword
    ) {}

    public record CompleteAccountResetRequest(
            @NotBlank(message = "Email is required")
            @Email(message = "Enter a valid email")
            String email,
            @NotBlank(message = "Reset code is required")
            String resetCode,
            @NotBlank(message = "New password is required")
            @Size(min = 8, message = "Password must be at least 8 characters")
            String newPassword
    ) {}

    public record AccountResetValidationResponse(Long userId, String email) {}
}
