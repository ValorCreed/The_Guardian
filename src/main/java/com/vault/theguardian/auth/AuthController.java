package com.vault.theguardian.auth;

import com.vault.theguardian.user.User;
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

    @PostMapping("/register")
    public AuthResponse register(@Valid @RequestBody RegisterRequest request) {
        return authService.register(request);
    }

    @PostMapping("/login")
    public AuthResponse login(@Valid @RequestBody LoginRequest request) {
        return authService.login(request);
    }

    @PostMapping("/verify-2fa")
    public AuthResponse verifyTwoFactor(@Valid @RequestBody VerifyTwoFactorRequest request) {
        return authService.verifyTwoFactor(request);
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

    @PostMapping("/verify-email")
    public MessageResponse verifyEmail(@Valid @RequestBody VerifyEmailRequest request) {
        return authService.verifyEmail(request);
    }

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
