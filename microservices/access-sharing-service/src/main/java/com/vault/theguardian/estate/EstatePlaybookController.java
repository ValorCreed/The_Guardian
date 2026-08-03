package com.vault.theguardian.estate;

import com.vault.theguardian.auth.AuthenticatedUser;
import com.vault.theguardian.vault.DownloadedDocument;
import jakarta.validation.Valid;
import org.springframework.http.ContentDisposition;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.nio.charset.StandardCharsets;

@RestController
@RequestMapping("/vault/estate-playbooks")
@CrossOrigin
public class EstatePlaybookController {
    private final EstatePlaybookService service;

    public EstatePlaybookController(EstatePlaybookService service) {
        this.service = service;
    }

    @GetMapping
    public EstateOverviewResponse overview(
            @AuthenticationPrincipal AuthenticatedUser user
    ) {
        return service.getOverview(user);
    }

    @PostMapping
    public EstatePlaybookResponse create(
            @AuthenticationPrincipal AuthenticatedUser user,
            @Valid @RequestBody EstatePlaybookRequest request
    ) {
        return service.create(user, request);
    }

    @PutMapping("/{id}")
    public EstatePlaybookResponse update(
            @AuthenticationPrincipal AuthenticatedUser user,
            @PathVariable Long id,
            @Valid @RequestBody EstatePlaybookRequest request
    ) {
        return service.update(user, id, request);
    }

    @DeleteMapping("/{id}")
    public void archive(
            @AuthenticationPrincipal AuthenticatedUser user,
            @PathVariable Long id
    ) {
        service.archive(user, id);
    }

    @PostMapping("/{id}/pause")
    public EstatePlaybookResponse pause(
            @AuthenticationPrincipal AuthenticatedUser user,
            @PathVariable Long id
    ) {
        return service.setActive(user, id, false);
    }

    @PostMapping("/{id}/resume")
    public EstatePlaybookResponse resume(
            @AuthenticationPrincipal AuthenticatedUser user,
            @PathVariable Long id
    ) {
        return service.setActive(user, id, true);
    }

    @PostMapping("/{id}/release")
    public EstateExecutionResponse release(
            @AuthenticationPrincipal AuthenticatedUser user,
            @PathVariable Long id
    ) {
        return service.releaseNow(user, id);
    }

    @PostMapping("/executions/{id}/cancel")
    public EstateExecutionResponse cancelExecution(
            @AuthenticationPrincipal AuthenticatedUser user,
            @PathVariable Long id
    ) {
        return service.cancelExecution(user, id);
    }

    @PostMapping("/executions/{id}/complete")
    public EstateExecutionResponse completeExecution(
            @AuthenticationPrincipal AuthenticatedUser user,
            @PathVariable Long id
    ) {
        return service.completeExecution(user, id);
    }

    @GetMapping("/executions/{id}/item")
    public EstateReleasedItemResponse releasedItem(
            @AuthenticationPrincipal AuthenticatedUser user,
            @PathVariable Long id
    ) {
        return service.getReleasedItem(user, id);
    }

    @GetMapping("/executions/{id}/document")
    public ResponseEntity<byte[]> downloadDocument(
            @AuthenticationPrincipal AuthenticatedUser user,
            @PathVariable Long id
    ) {
        DownloadedDocument document = service.downloadReleasedDocument(user, id);

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
                        ContentDisposition.attachment()
                                .filename(document.fileName(), StandardCharsets.UTF_8)
                                .build()
                                .toString()
                )
                .body(document.bytes());
    }
}
