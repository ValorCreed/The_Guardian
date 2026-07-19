package com.vault.theguardian.backuprecovery.recovery;

import com.vault.theguardian.backuprecovery.auth.AuthenticatedUser;
import com.vault.theguardian.backuprecovery.common.MessageResponse;
import jakarta.validation.Valid;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/vault/recovery-kit")
@CrossOrigin
public class RecoveryKitController {
    private final RecoveryKitService recoveryKitService;

    public RecoveryKitController(RecoveryKitService recoveryKitService) {
        this.recoveryKitService = recoveryKitService;
    }

    @GetMapping("/status")
    public RecoveryKitStatusResponse getStatus(
            @AuthenticationPrincipal AuthenticatedUser user
    ) {
        return recoveryKitService.getStatus(user);
    }

    @PostMapping("/generate")
    public RecoveryKitResponse generateRecoveryKit(
            @AuthenticationPrincipal AuthenticatedUser user,
            @Valid @RequestBody RecoveryKitGenerateRequest request
    ) {
        return recoveryKitService.generateRecoveryKit(user, request);
    }

    @DeleteMapping
    public MessageResponse revokeRecoveryKit(
            @AuthenticationPrincipal AuthenticatedUser user
    ) {
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
