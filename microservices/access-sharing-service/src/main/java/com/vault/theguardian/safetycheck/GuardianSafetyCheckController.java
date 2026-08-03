package com.vault.theguardian.safetycheck;

import com.vault.theguardian.auth.AuthenticatedUser;
import jakarta.validation.Valid;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/vault/safety-check")
public class GuardianSafetyCheckController {
    private final GuardianSafetyCheckService safetyCheckService;

    public GuardianSafetyCheckController(GuardianSafetyCheckService safetyCheckService) {
        this.safetyCheckService = safetyCheckService;
    }

    @GetMapping
    public SafetyCheckResponse getSafetyCheck(
            @AuthenticationPrincipal AuthenticatedUser user
    ) {
        return safetyCheckService.getSafetyCheck(user);
    }

    @PutMapping
    public SafetyCheckResponse updateSafetyCheck(
            @AuthenticationPrincipal AuthenticatedUser user,
            @Valid @RequestBody UpdateSafetyCheckRequest request
    ) {
        return safetyCheckService.updateSafetyCheck(user, request);
    }

    @PostMapping("/check-in")
    public SafetyCheckResponse checkIn(
            @AuthenticationPrincipal AuthenticatedUser user
    ) {
        return safetyCheckService.checkIn(user);
    }
}
