package com.vault.theguardian.family;

import com.vault.theguardian.user.User;
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
    public FamilyOverviewResponse getFamilyOverview(@AuthenticationPrincipal User user) {
        return familyService.getOverview(user);
    }


    @GetMapping("/members/lookup")
    public ResponseEntity<Map<String, Object>> lookupPotentialMember(
            @AuthenticationPrincipal User user,
            @RequestParam String email
    ) {
        return familyService.lookupPotentialMember(user, email);
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

    @GetMapping("/member-password-risks")
    public List<FamilyMemberPasswordRiskResponse> getFamilyMemberPasswordRisks(@AuthenticationPrincipal User user) {
        return familyService.getFamilyMemberPasswordRisks(user);
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

    @GetMapping("/shared-documents/{itemId}/download")
    public ResponseEntity<byte[]> downloadSharedDocument(
            @AuthenticationPrincipal User user,
            @PathVariable Long itemId
    ) {
        byte[] fileBytes = familyService.getSharedDocumentBytes(user, itemId);
        String fileName = familyService.getSharedDocumentDownloadFileName(user, itemId);
        String contentType = familyService.getSharedDocumentDownloadContentType(user, itemId);

        MediaType mediaType;
        try {
            mediaType = MediaType.parseMediaType(contentType);
        } catch (Exception error) {
            mediaType = MediaType.APPLICATION_OCTET_STREAM;
        }

        return ResponseEntity.ok()
                .contentType(mediaType)
                .contentLength(fileBytes.length)
                .header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=\"" + fileName + "\"")
                .body(fileBytes);
    }

    @GetMapping("/shared-notes")
    public List<SharedNoteItemResponse> getSharedNoteItems(@AuthenticationPrincipal User user) {
        return familyService.getSharedNoteItems(user);
    }

    @GetMapping("/shared-notes/{itemId}")
    public SharedNoteItemResponse getSharedNoteItem(
            @AuthenticationPrincipal User user,
            @PathVariable Long itemId
    ) {
        return familyService.getSharedNoteItem(user, itemId);
    }
}
