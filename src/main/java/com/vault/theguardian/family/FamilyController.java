package com.vault.theguardian.family;

import com.vault.theguardian.user.User;
import jakarta.validation.Valid;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/vault/family")
@CrossOrigin
public class FamilyController {
    private final FamilyService familyService;

    public FamilyController(FamilyService familyService) {
        this.familyService = familyService;
    }

    @GetMapping
    public FamilyOverviewResponse getFamilyOverview(@AuthenticationPrincipal User user) {
        return familyService.getOverview(user);
    }

    @PostMapping("/members")
    public FamilyMemberResponse addMember(
            @AuthenticationPrincipal User user,
            @Valid @RequestBody AddFamilyMemberRequest request
    ) {
        return familyService.addMember(user, request);
    }

    @DeleteMapping("/members/{membershipId}")
    public void removeMember(
            @AuthenticationPrincipal User user,
            @PathVariable Long membershipId
    ) {
        familyService.removeMember(user, membershipId);
    }

    @GetMapping("/shared-items")
    public SharedFamilyItemsResponse getSharedItems(@AuthenticationPrincipal User user) {
        return familyService.getSharedItems(user);
    }

    @GetMapping("/shared-passwords")
    public List<SharedPasswordItemResponse> getSharedPasswordItems(@AuthenticationPrincipal User user) {
        return familyService.getSharedPasswordItems(user);
    }

    @GetMapping("/shared-passwords/{itemId}")
    public SharedPasswordItemResponse getSharedPasswordItem(
            @AuthenticationPrincipal User user,
            @PathVariable Long itemId
    ) {
        return familyService.getSharedPasswordItem(user, itemId);
    }

    @GetMapping("/shared-cards")
    public List<SharedCardItemResponse> getSharedCardItems(@AuthenticationPrincipal User user) {
        return familyService.getSharedCardItems(user);
    }

    @GetMapping("/shared-cards/{itemId}")
    public SharedCardItemResponse getSharedCardItem(
            @AuthenticationPrincipal User user,
            @PathVariable Long itemId
    ) {
        return familyService.getSharedCardItem(user, itemId);
    }

    @GetMapping("/shared-documents")
    public List<SharedDocumentItemResponse> getSharedDocumentItems(@AuthenticationPrincipal User user) {
        return familyService.getSharedDocumentItems(user);
    }

    @GetMapping("/shared-documents/{itemId}")
    public SharedDocumentItemResponse getSharedDocumentItem(
            @AuthenticationPrincipal User user,
            @PathVariable Long itemId
    ) {
        return familyService.getSharedDocumentItem(user, itemId);
    }
}
