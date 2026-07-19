package com.vault.theguardian.securityhealthservice.securityalert;

import com.vault.theguardian.securityhealthservice.auth.AuthenticatedUser;
import com.vault.theguardian.securityhealthservice.common.MessageResponse;
import jakarta.validation.Valid;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.CrossOrigin;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/vault/security-alerts")
@CrossOrigin
public class SecurityAlertController {
    private final SecurityAlertService securityAlertService;

    public SecurityAlertController(SecurityAlertService securityAlertService) {
        this.securityAlertService = securityAlertService;
    }

    @PostMapping("/scan")
    public MessageResponse reportSecurityScan(
            @AuthenticationPrincipal AuthenticatedUser user,
            @Valid @RequestBody SecurityAlertRequest request
    ) {
        return securityAlertService.recordScan(user, request);
    }
}
