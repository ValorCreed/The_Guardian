package com.vault.theguardian.emergency;

import com.vault.theguardian.auth.AuthenticatedUser;
import com.vault.theguardian.vault.DownloadedDocument;
import jakarta.validation.Valid;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/vault/emergency")
@CrossOrigin
public class EmergencyAccessController {
    private final EmergencyAccessService emergencyAccessService;

    public EmergencyAccessController(EmergencyAccessService emergencyAccessService) {
        this.emergencyAccessService = emergencyAccessService;
    }

    @GetMapping("/overview")
    public EmergencyOverviewResponse getOverview(
            @AuthenticationPrincipal AuthenticatedUser user
    ) {
        return emergencyAccessService.getOverview(user);
    }

    @GetMapping("/contacts")
    public List<EmergencyContactResponse> getContacts(
            @AuthenticationPrincipal AuthenticatedUser user
    ) {
        return emergencyAccessService.getContacts(user);
    }

    @PostMapping("/contacts")
    public EmergencyContactResponse createContact(
            @AuthenticationPrincipal AuthenticatedUser user,
            @Valid @RequestBody EmergencyContactRequest request
    ) {
        return emergencyAccessService.createContact(user, request);
    }

    @GetMapping("/contacts/{id}")
    public EmergencyContactResponse getContact(
            @AuthenticationPrincipal AuthenticatedUser user,
            @PathVariable Long id
    ) {
        return emergencyAccessService.getContact(user, id);
    }

    @PutMapping("/contacts/{id}")
    public EmergencyContactResponse updateContact(
            @AuthenticationPrincipal AuthenticatedUser user,
            @PathVariable Long id,
            @Valid @RequestBody EmergencyContactRequest request
    ) {
        return emergencyAccessService.updateContact(user, id, request);
    }

    @DeleteMapping("/contacts/{id}")
    public void deleteContact(
            @AuthenticationPrincipal AuthenticatedUser user,
            @PathVariable Long id
    ) {
        emergencyAccessService.deleteContact(user, id);
    }

    @PostMapping("/requests")
    public EmergencyAccessRequestResponse requestAccess(
            @AuthenticationPrincipal AuthenticatedUser user,
            @Valid @RequestBody EmergencyAccessRequestDto request
    ) {
        return emergencyAccessService.requestAccess(user, request);
    }

    @GetMapping("/requests")
    public List<EmergencyAccessRequestResponse> getReceivedRequests(
            @AuthenticationPrincipal AuthenticatedUser user
    ) {
        return emergencyAccessService.getReceivedRequests(user);
    }

    @PostMapping("/requests/{id}/approve")
    public EmergencyAccessRequestResponse approveRequest(
            @AuthenticationPrincipal AuthenticatedUser user,
            @PathVariable Long id
    ) {
        return emergencyAccessService.approveRequest(user, id);
    }

    @PostMapping("/requests/{id}/deny")
    public EmergencyAccessRequestResponse denyRequest(
            @AuthenticationPrincipal AuthenticatedUser user,
            @PathVariable Long id
    ) {
        return emergencyAccessService.denyRequest(user, id);
    }

    @GetMapping("/requests/{id}/vault")
    public EmergencyVaultItemsResponse getEmergencyVault(
            @AuthenticationPrincipal AuthenticatedUser user,
            @PathVariable Long id
    ) {
        return emergencyAccessService.getEmergencyVault(user, id);
    }

    @GetMapping("/requests/{id}/vault/{itemType}/{itemId}")
    public EmergencyVaultItemResponse getEmergencyVaultItem(
            @AuthenticationPrincipal AuthenticatedUser user,
            @PathVariable Long id,
            @PathVariable String itemType,
            @PathVariable Long itemId
    ) {
        return emergencyAccessService.getEmergencyVaultItem(user, id, itemType, itemId);
    }

    @GetMapping("/requests/{id}/vault/DOCUMENT/{itemId}/download")
    public ResponseEntity<byte[]> downloadEmergencyDocument(
            @AuthenticationPrincipal AuthenticatedUser user,
            @PathVariable Long id,
            @PathVariable Long itemId
    ) {
        DownloadedDocument document =
                emergencyAccessService.downloadEmergencyDocument(user, id, itemId);

        MediaType mediaType;
        try {
            mediaType = MediaType.parseMediaType(document.contentType());
        } catch (Exception ignored) {
            mediaType = MediaType.APPLICATION_OCTET_STREAM;
        }

        return ResponseEntity.ok()
                .contentType(mediaType)
                .contentLength(document.bytes().length)
                .header(
                        HttpHeaders.CONTENT_DISPOSITION,
                        "attachment; filename=\"" + document.fileName() + "\""
                )
                .body(document.bytes());
    }

    @GetMapping("/audit")
    public List<EmergencyAuditLogResponse> getAuditLogs(
            @AuthenticationPrincipal AuthenticatedUser user
    ) {
        return emergencyAccessService.getAuditLogs(user);
    }
}
