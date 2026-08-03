package com.vault.theguardian.duress;

import com.vault.theguardian.user.User;
import jakarta.validation.Valid;
import jakarta.servlet.http.HttpServletRequest;
import com.vault.theguardian.auth.AuthResponse;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/vault/auth/duress")
public class DuressController {
    private final DuressService duressService;

    public DuressController(DuressService duressService) {
        this.duressService = duressService;
    }

    @GetMapping
    public DuressSettingsResponse settings(@AuthenticationPrincipal User user) {
        return duressService.settings(user);
    }

    @PutMapping
    public DuressSettingsResponse configure(
            @AuthenticationPrincipal User user,
            @Valid @RequestBody ConfigureDuressRequest request
    ) {
        return duressService.configure(user, request);
    }

    @PostMapping("/preview")
    public AuthResponse openPreview(
            @AuthenticationPrincipal User user,
            @Valid @RequestBody OpenDuressPreviewRequest request,
            HttpServletRequest httpRequest
    ) {
        return duressService.openPreview(user, request, httpRequest);
    }

    @DeleteMapping
    public DuressMessageResponse disable(
            @AuthenticationPrincipal User user,
            @Valid @RequestBody DisableDuressRequest request
    ) {
        return duressService.disable(user, request);
    }
}
