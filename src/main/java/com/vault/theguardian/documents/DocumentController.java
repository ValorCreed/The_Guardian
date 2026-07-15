package com.vault.theguardian.documents;

import com.vault.theguardian.user.User;
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

    private final DocumentService documentService;

    public DocumentController(DocumentService documentService) {
        this.documentService = documentService;
    }

    @PostMapping
    public DocumentResponse createDocument(
            @AuthenticationPrincipal User user,
            @Valid @RequestBody DocumentRequest request
    ) {
        return documentService.createDocument(user, request);
    }

    @GetMapping
    public List<DocumentResponse> getMyDocuments(
            @AuthenticationPrincipal User user
    ) {
        return documentService.getMyDocuments(user);
    }

    @PostMapping(value = "/upload", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public DocumentResponse uploadDocument(
            @AuthenticationPrincipal User user,
            @RequestParam("file") MultipartFile file,
            @RequestParam("documentName") String documentName,
            @RequestParam("documentType") String documentType,
            @RequestParam("sizeBytes") Long sizeBytes
    ) throws IOException {
        return documentService.uploadDocument(user, file, documentName, documentType, sizeBytes);
    }

    @GetMapping("/{id}")
    public DocumentResponse getDocument(
            @AuthenticationPrincipal User user,
            @PathVariable Long id
    ) {
        return documentService.getDocument(user, id);
    }

    @GetMapping("/{id}/download")
    public ResponseEntity<byte[]> downloadDocument(
            @AuthenticationPrincipal User user,
            @PathVariable Long id
    ) {
        byte[] fileBytes = documentService.getDocumentBytes(user, id);
        String fileName = documentService.getDownloadFileName(user, id);
        String contentType = documentService.getDownloadContentType(user, id);

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

    @PutMapping("/{id}")
    public DocumentResponse updateDocument(
            @AuthenticationPrincipal User user,
            @PathVariable Long id,
            @Valid @RequestBody DocumentRequest request
    ) {
        return documentService.updateDocument(user, id, request);
    }

    @DeleteMapping("/{id}")
    public void deleteDocument(
            @AuthenticationPrincipal User user,
            @PathVariable Long id
    ) {
        documentService.deleteDocument(user, id);
    }
}
