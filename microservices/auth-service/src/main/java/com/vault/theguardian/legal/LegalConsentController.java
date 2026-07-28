package com.vault.theguardian.legal;

import com.vault.theguardian.user.User;
import jakarta.validation.Valid;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/vault/auth/legal-consent")
@CrossOrigin
public class LegalConsentController {
    private final LegalConsentService service;

    public LegalConsentController(LegalConsentService service) {
        this.service = service;
    }

    @GetMapping
    public LegalConsentResponse getConsent(
            @AuthenticationPrincipal User user,
            @RequestParam String version
    ) {
        return service.getConsent(user, version);
    }

    @PostMapping
    public LegalConsentResponse saveConsent(
            @AuthenticationPrincipal User user,
            @Valid @RequestBody LegalConsentRequest request
    ) {
        return service.saveConsent(user, request);
    }
}
