package com.vault.theguardian.vaultservice.documents;

import com.vault.theguardian.vaultservice.auth.AuthenticatedUser;
import jakarta.validation.Valid;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.util.List;

@RestController
@RequestMapping("/vault/documents")
@CrossOrigin
public class DocumentController {
    private final DocumentService service;
    public DocumentController(DocumentService service) { this.service = service; }

    @PostMapping
    public DocumentResponse create(@AuthenticationPrincipal AuthenticatedUser user,
                                   @Valid @RequestBody DocumentRequest request) {
        return service.createDocument(user.userId(), user.isDuress(), request);
    }

    @GetMapping
    public List<DocumentResponse> list(@AuthenticationPrincipal AuthenticatedUser user) {
        return service.getMyDocuments(user.userId(), user.isDuress());
    }

    @PostMapping(value = "/upload", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public DocumentResponse upload(
            @AuthenticationPrincipal AuthenticatedUser user,
            @RequestParam("file") MultipartFile file,
            @RequestParam("documentName") String documentName,
            @RequestParam("documentType") String documentType,
            @RequestParam("sizeBytes") Long sizeBytes
    ) throws IOException {
        return service.uploadDocument(user.userId(), user.isDuress(), file, documentName, documentType, sizeBytes);
    }

    @GetMapping("/{id}")
    public DocumentResponse get(@AuthenticationPrincipal AuthenticatedUser user, @PathVariable Long id) {
        return service.getDocument(user.userId(), user.isDuress(), id);
    }

    @GetMapping("/{id}/download")
    public ResponseEntity<byte[]> download(@AuthenticationPrincipal AuthenticatedUser user,
                                           @PathVariable Long id) {
        byte[] bytes = service.getDocumentBytes(user.userId(), user.isDuress(), id);
        String fileName = service.getDownloadFileName(user.userId(), user.isDuress(), id);
        String contentType = service.getDownloadContentType(user.userId(), user.isDuress(), id);
        MediaType mediaType;
        try { mediaType = MediaType.parseMediaType(contentType); }
        catch (Exception ignored) { mediaType = MediaType.APPLICATION_OCTET_STREAM; }
        return ResponseEntity.ok()
                .contentType(mediaType)
                .contentLength(bytes.length)
                .header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=\"" + fileName + "\"")
                .body(bytes);
    }

    @PutMapping("/{id}")
    public DocumentResponse update(@AuthenticationPrincipal AuthenticatedUser user,
                                   @PathVariable Long id,
                                   @Valid @RequestBody DocumentRequest request) {
        return service.updateDocument(user.userId(), user.isDuress(), id, request);
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> delete(@AuthenticationPrincipal AuthenticatedUser user,
                                       @PathVariable Long id) {
        service.deleteDocument(user.userId(), user.isDuress(), id);
        return ResponseEntity.noContent().build();
    }
}
