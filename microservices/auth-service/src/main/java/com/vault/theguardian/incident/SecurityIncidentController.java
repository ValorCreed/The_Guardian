package com.vault.theguardian.incident;

import com.vault.theguardian.user.User;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/vault/auth/incidents")
@CrossOrigin
public class SecurityIncidentController {
    private final SecurityIncidentService service;

    public SecurityIncidentController(SecurityIncidentService service) {
        this.service = service;
    }

    @GetMapping
    public IncidentOverviewResponse overview(@AuthenticationPrincipal User user) {
        return service.overview(user);
    }

    @PostMapping("/start")
    public SecurityIncidentResponse start(
            @AuthenticationPrincipal User user,
            @Valid @RequestBody StartIncidentRequest request,
            HttpServletRequest httpRequest
    ) {
        return service.start(user, request, httpRequest);
    }

    @PatchMapping("/{incidentId}/tasks/{taskId}")
    public SecurityIncidentResponse updateTask(
            @AuthenticationPrincipal User user,
            @PathVariable Long incidentId,
            @PathVariable Long taskId,
            @Valid @RequestBody UpdateIncidentTaskRequest request
    ) {
        return service.updateTask(user, incidentId, taskId, request);
    }

    @PostMapping("/{incidentId}/rotate-password")
    public SecurityIncidentResponse rotatePassword(
            @AuthenticationPrincipal User user,
            @PathVariable Long incidentId,
            @Valid @RequestBody RotateIncidentPasswordRequest request
    ) {
        return service.rotateMasterPassword(user, incidentId, request);
    }

    @PostMapping("/{incidentId}/complete")
    public SecurityIncidentResponse complete(
            @AuthenticationPrincipal User user,
            @PathVariable Long incidentId
    ) {
        return service.complete(user, incidentId);
    }

    @PostMapping("/{incidentId}/cancel")
    public SecurityIncidentResponse cancel(
            @AuthenticationPrincipal User user,
            @PathVariable Long incidentId,
            @Valid @RequestBody CancelIncidentRequest request
    ) {
        return service.cancel(user, incidentId, request);
    }
}
