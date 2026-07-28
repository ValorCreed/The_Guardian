package com.vault.theguardian.auth;

import com.vault.theguardian.biometric.BiometricEnrollmentResponse;
import com.vault.theguardian.biometric.BiometricLoginRequest;
import com.vault.theguardian.user.User;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("vault/auth")
@CrossOrigin
public class AuthController {
    private final AuthService authService;

    public AuthController(AuthService authService) {
        this.authService = authService;
    }

    /**
     * Starts registration only. No User, Subscription, UserSession, welcome
     * notification, or JWT is created until /verify-registration succeeds.
     */
    @PostMapping("/register")
    public RegistrationStartResponse register(
            @Valid @RequestBody RegisterRequest request
    ) {
        return authService.startRegistration(request);
    }

    @PostMapping("/verify-registration")
    public AuthResponse verifyRegistration(
            @Valid @RequestBody VerifyEmailRequest request,
            HttpServletRequest httpRequest
    ) {
        return authService.verifyRegistration(request, httpRequest);
    }

    @PostMapping("/resend-registration-code")
    public MessageResponse resendRegistrationCode(
            @Valid @RequestBody ResendVerificationRequest request
    ) {
        return authService.resendRegistrationCode(request);
    }

    @PostMapping("/login")
    public AuthResponse login(
            @Valid @RequestBody LoginRequest request,
            HttpServletRequest httpRequest
    ) {
        return authService.login(request, httpRequest);
    }

    @PostMapping("/biometric/login")
    public AuthResponse biometricLogin(
            @Valid @RequestBody BiometricLoginRequest request,
            HttpServletRequest httpRequest
    ) {
        return authService.biometricLogin(request, httpRequest);
    }

    @PostMapping("/biometric/enroll")
    public BiometricEnrollmentResponse enrollBiometricCredential(
            @AuthenticationPrincipal User user,
            HttpServletRequest httpRequest
    ) {
        return authService.enrollBiometricCredential(user, httpRequest);
    }

    @DeleteMapping("/biometric")
    public MessageResponse revokeBiometricCredential(
            @AuthenticationPrincipal User user,
            HttpServletRequest httpRequest
    ) {
        return authService.revokeBiometricCredential(user, httpRequest);
    }

    @PostMapping("/verify-2fa")
    public AuthResponse verifyTwoFactor(
            @Valid @RequestBody VerifyTwoFactorRequest request,
            HttpServletRequest httpRequest
    ) {
        return authService.verifyTwoFactor(request, httpRequest);
    }

    @GetMapping("/me/security")
    public SecuritySettingsResponse getSecuritySettings(@AuthenticationPrincipal User user) {
        return authService.getSecuritySettings(user);
    }

    @PutMapping("/2fa")
    public SecuritySettingsResponse setTwoFactorEnabled(
            @AuthenticationPrincipal User user,
            @RequestBody TwoFactorToggleRequest request
    ) {
        return authService.setTwoFactorEnabled(user, request);
    }

    /**
     * Retained for legacy accounts that were created by an older app version
     * before strict pre-registration verification was introduced.
     */
    @PostMapping("/verify-email")
    public MessageResponse verifyEmail(@Valid @RequestBody VerifyEmailRequest request) {
        return authService.verifyEmail(request);
    }

    /** Retained for legacy unverified accounts. */
    @PostMapping("/resend-verification")
    public MessageResponse resendVerification(@Valid @RequestBody ResendVerificationRequest request) {
        return authService.resendVerificationCode(request);
    }

    @PostMapping("/forgot-password")
    public MessageResponse forgotPassword(@Valid @RequestBody ForgotPasswordRequest request) {
        return authService.forgotPassword(request);
    }

    @PostMapping("/reset-password")
    public MessageResponse resetPassword(@Valid @RequestBody ResetPasswordRequest request) {
        return authService.resetPassword(request);
    }

    @PostMapping("/logout")
    public LogoutResponse logout() {
        return new LogoutResponse("Successfully logged out");
    }
}
