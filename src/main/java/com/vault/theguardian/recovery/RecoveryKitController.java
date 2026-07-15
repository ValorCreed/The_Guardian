package com.vault.theguardian.recovery;

import com.vault.theguardian.auth.MessageResponse;
import com.vault.theguardian.user.User;
import jakarta.validation.Valid;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("vault/recovery-kit")
@CrossOrigin
public class RecoveryKitController {
    private final RecoveryKitService recoveryKitService;

    public RecoveryKitController(RecoveryKitService recoveryKitService) {
        this.recoveryKitService = recoveryKitService;
    }

    @GetMapping("/status")
    public RecoveryKitStatusResponse getStatus(@AuthenticationPrincipal User user) {
        return recoveryKitService.getStatus(user);
    }

    @PostMapping("/generate")
    public RecoveryKitResponse generateRecoveryKit(
            @AuthenticationPrincipal User user,
            @Valid @RequestBody RecoveryKitGenerateRequest request
    ) {
        return recoveryKitService.generateRecoveryKit(user, request);
    }

    @DeleteMapping
    public MessageResponse revokeRecoveryKit(@AuthenticationPrincipal User user) {
        return recoveryKitService.revokeRecoveryKit(user);
    }

    @PostMapping("/reset-password")
    public MessageResponse resetPasswordWithRecoveryKit(
            @Valid @RequestBody RecoveryPasswordResetRequest request
    ) {
        return recoveryKitService.resetPasswordWithRecoveryKit(request);
    }

    @PostMapping("/reset-account")
    public MessageResponse resetAccountAndEraseVault(
            @Valid @RequestBody AccountResetEraseRequest request
    ) {
        return recoveryKitService.resetAccountAndEraseVault(request);
    }
}
