package com.vault.theguardian.resetpassword;

import jakarta.validation.Valid;
import org.springframework.web.bind.annotation.*;


@RestController
@RequestMapping("vault/auth")
@CrossOrigin
public class PasswordResetController {
    private final PasswordResetService passwordResetService;

    public PasswordResetController(PasswordResetService passwordResetService) {
        this.passwordResetService = passwordResetService;
    }

    @PostMapping("/forgot-password")
    public String forgotPassword(@Valid @RequestBody ForgotPasswordRequest forgotPasswordRequest) {
        return passwordResetService.forgotPassword(forgotPasswordRequest);
    }

    @PostMapping("/reset-password")
    public String resetPassword(@Valid @RequestBody ResetPasswordRequest resetPasswordRequest) {
        return passwordResetService.resetPassword(resetPasswordRequest);
    }
}
