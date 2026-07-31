package com.vault.theguardian.session;

import com.vault.theguardian.auth.MessageResponse;
import com.vault.theguardian.user.User;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/vault/sessions")
@CrossOrigin
public class DeviceSessionController {
    private final DeviceSessionService deviceSessionService;

    public DeviceSessionController(DeviceSessionService deviceSessionService) {
        this.deviceSessionService = deviceSessionService;
    }

    @GetMapping
    public List<DeviceSessionResponse> getMySessions(
            @AuthenticationPrincipal User user,
            HttpServletRequest request
    ) {
        return deviceSessionService.getMySessions(user, request);
    }

    @DeleteMapping("/{id}")
    public MessageResponse revokeSession(
            @AuthenticationPrincipal User user,
            @PathVariable Long id,
            HttpServletRequest request
    ) {
        deviceSessionService.revokeSession(user, id, request);
        return new MessageResponse("Device session revoked.");
    }

    @PostMapping("/logout-others")
    public MessageResponse logoutOtherDevices(
            @AuthenticationPrincipal User user,
            HttpServletRequest request
    ) {
        deviceSessionService.revokeOtherSessions(user, request);
        return new MessageResponse("Other devices have been logged out.");
    }

    @PostMapping("/logout-all")
    public MessageResponse logoutAllDevices(@AuthenticationPrincipal User user) {
        deviceSessionService.revokeAllSessions(user);
        return new MessageResponse("All devices have been logged out.");
    }
}
