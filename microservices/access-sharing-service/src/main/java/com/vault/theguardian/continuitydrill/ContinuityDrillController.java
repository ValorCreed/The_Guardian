package com.vault.theguardian.continuitydrill;

import com.vault.theguardian.auth.AuthenticatedUser;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/vault/continuity-drill")
@CrossOrigin
public class ContinuityDrillController {
    private final ContinuityDrillService service;

    public ContinuityDrillController(ContinuityDrillService service) {
        this.service = service;
    }

    @GetMapping
    public ContinuityOverviewResponse overview(
            @AuthenticationPrincipal AuthenticatedUser user
    ) {
        return service.overview(user);
    }

    @PostMapping("/start")
    public ContinuityDrillResponse start(
            @AuthenticationPrincipal AuthenticatedUser user
    ) {
        return service.start(user);
    }

    @PostMapping("/{drillId}/complete")
    public ContinuityDrillResponse complete(
            @AuthenticationPrincipal AuthenticatedUser user,
            @PathVariable Long drillId
    ) {
        return service.complete(user, drillId);
    }

    @PostMapping("/{drillId}/cancel")
    public ContinuityDrillResponse cancel(
            @AuthenticationPrincipal AuthenticatedUser user,
            @PathVariable Long drillId
    ) {
        return service.cancel(user, drillId);
    }

    @PostMapping("/requests/{publicId}/acknowledge")
    public ContinuityAcknowledgementResponse acknowledge(
            @AuthenticationPrincipal AuthenticatedUser user,
            @PathVariable String publicId
    ) {
        return service.acknowledge(user, publicId);
    }
}
