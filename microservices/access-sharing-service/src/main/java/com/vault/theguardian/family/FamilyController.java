package com.vault.theguardian.family;

import com.vault.theguardian.auth.AuthenticatedUser;
import com.vault.theguardian.vault.DownloadedDocument;
import jakarta.validation.Valid;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/vault/family")
@CrossOrigin
public class FamilyController {
    private final FamilyService familyService;

    public FamilyController(FamilyService familyService) {
        this.familyService = familyService;
    }

    @GetMapping
    public FamilyOverviewResponse getFamilyOverview(
            @AuthenticationPrincipal AuthenticatedUser user
    ) {
        return familyService.getOverview(user);
    }

    @GetMapping("/members/lookup")
    public ResponseEntity<Map<String, Object>> lookupPotentialMember(
            @AuthenticationPrincipal AuthenticatedUser user,
            @RequestParam String email
    ) {
        return familyService.lookupPotentialMember(user, email);
    }

    @PostMapping("/members")
    public FamilyMemberResponse addMember(
            @AuthenticationPrincipal AuthenticatedUser user,
            @Valid @RequestBody AddFamilyMemberRequest request
    ) {
        return familyService.addMember(user, request);
    }

    @DeleteMapping("/members/{membershipId}")
    public void removeMember(
            @AuthenticationPrincipal AuthenticatedUser user,
            @PathVariable Long membershipId
    ) {
        familyService.removeMember(user, membershipId);
    }

    @GetMapping("/shared-items")
    public SharedFamilyItemsResponse getSharedItems(
            @AuthenticationPrincipal AuthenticatedUser user
    ) {
        return familyService.getSharedItems(user);
    }

    @GetMapping("/member-password-risks")
    public List<FamilyMemberPasswordRiskResponse> getFamilyMemberPasswordRisks(
            @AuthenticationPrincipal AuthenticatedUser user
    ) {
        return familyService.getFamilyMemberPasswordRisks(user);
    }

    @GetMapping("/shared-passwords")
    public List<SharedPasswordItemResponse> getSharedPasswordItems(
            @AuthenticationPrincipal AuthenticatedUser user
    ) {
        return familyService.getSharedPasswordItems(user);
    }

    @GetMapping("/shared-passwords/{itemId}")
    public SharedPasswordItemResponse getSharedPasswordItem(
            @AuthenticationPrincipal AuthenticatedUser user,
            @PathVariable Long itemId
    ) {
        return familyService.getSharedPasswordItem(user, itemId);
    }

    @GetMapping("/shared-cards")
    public List<SharedCardItemResponse> getSharedCardItems(
            @AuthenticationPrincipal AuthenticatedUser user
    ) {
        return familyService.getSharedCardItems(user);
    }

    @GetMapping("/shared-cards/{itemId}")
    public SharedCardItemResponse getSharedCardItem(
            @AuthenticationPrincipal AuthenticatedUser user,
            @PathVariable Long itemId
    ) {
        return familyService.getSharedCardItem(user, itemId);
    }

    @GetMapping("/shared-documents")
    public List<SharedDocumentItemResponse> getSharedDocumentItems(
            @AuthenticationPrincipal AuthenticatedUser user
    ) {
        return familyService.getSharedDocumentItems(user);
    }

    @GetMapping("/shared-documents/{itemId}")
    public SharedDocumentItemResponse getSharedDocumentItem(
            @AuthenticationPrincipal AuthenticatedUser user,
            @PathVariable Long itemId
    ) {
        return familyService.getSharedDocumentItem(user, itemId);
    }

    @GetMapping("/shared-documents/{itemId}/download")
    public ResponseEntity<byte[]> downloadSharedDocument(
            @AuthenticationPrincipal AuthenticatedUser user,
            @PathVariable Long itemId
    ) {
        DownloadedDocument document = familyService.downloadSharedDocument(user, itemId);

        MediaType mediaType;
        try {
            mediaType = MediaType.parseMediaType(document.contentType());
        } catch (Exception ignored) {
            mediaType = MediaType.APPLICATION_OCTET_STREAM;
        }

        return ResponseEntity.ok()
                .contentType(mediaType)
                .contentLength(document.bytes().length)
                .header(HttpHeaders.CONTENT_DISPOSITION,
                        "attachment; filename=\"" + document.fileName() + "\"")
                .body(document.bytes());
    }

    @GetMapping("/shared-notes")
    public List<SharedNoteItemResponse> getSharedNoteItems(
            @AuthenticationPrincipal AuthenticatedUser user
    ) {
        return familyService.getSharedNoteItems(user);
    }

    @GetMapping("/shared-notes/{itemId}")
    public SharedNoteItemResponse getSharedNoteItem(
            @AuthenticationPrincipal AuthenticatedUser user,
            @PathVariable Long itemId
    ) {
        return familyService.getSharedNoteItem(user, itemId);
    }
}
