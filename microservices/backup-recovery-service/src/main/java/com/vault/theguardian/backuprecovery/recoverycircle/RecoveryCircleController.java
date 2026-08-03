package com.vault.theguardian.backuprecovery.recoverycircle;

import com.vault.theguardian.backuprecovery.auth.AuthenticatedUser;
import com.vault.theguardian.backuprecovery.common.MessageResponse;
import jakarta.validation.Valid;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/vault/recovery-circle")
@CrossOrigin
public class RecoveryCircleController {
    private final RecoveryCircleService service;

    public RecoveryCircleController(RecoveryCircleService service) {
        this.service = service;
    }

    @GetMapping
    public RecoveryCircleOverviewResponse getOverview(
            @AuthenticationPrincipal AuthenticatedUser user
    ) {
        return service.getOverview(user);
    }

    @PutMapping
    public RecoveryCircleOverviewResponse updateCircle(
            @AuthenticationPrincipal AuthenticatedUser user,
            @Valid @RequestBody UpdateRecoveryCircleRequest request
    ) {
        return service.updateCircle(user, request);
    }

    @PostMapping("/requests/{requestId}/approve")
    public RecoveryCircleRequestResponse approve(
            @AuthenticationPrincipal AuthenticatedUser user,
            @PathVariable String requestId
    ) {
        return service.approve(user, requestId);
    }

    @PostMapping("/requests/{requestId}/deny")
    public RecoveryCircleRequestResponse deny(
            @AuthenticationPrincipal AuthenticatedUser user,
            @PathVariable String requestId
    ) {
        return service.deny(user, requestId);
    }

    @PostMapping("/requests/{requestId}/cancel")
    public MessageResponse cancel(
            @AuthenticationPrincipal AuthenticatedUser user,
            @PathVariable String requestId
    ) {
        return service.cancelOwnedRequest(user, requestId);
    }

    @PostMapping("/recovery/start")
    public StartRecoveryCircleResponse startRecovery(
            @Valid @RequestBody StartRecoveryCircleRequest request
    ) {
        return service.startRecovery(request);
    }

    @PostMapping("/recovery/status")
    public RecoveryCirclePublicStatusResponse getStatus(
            @Valid @RequestBody RecoveryCircleStatusRequest request
    ) {
        return service.getPublicStatus(request);
    }

    @PostMapping("/recovery/complete")
    public MessageResponse completeRecovery(
            @Valid @RequestBody CompleteRecoveryCircleRequest request
    ) {
        return service.completeRecovery(request);
    }
}
