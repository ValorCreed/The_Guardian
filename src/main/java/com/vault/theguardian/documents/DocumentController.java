package com.vault.theguardian.documents;

import com.vault.theguardian.user.User;
import jakarta.validation.Valid;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

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

    @DeleteMapping("/{id}")
    public void deleteDocument(
            @AuthenticationPrincipal User user,
            @PathVariable Long id
    ) {
        documentService.deleteDocument(user, id);
    }
}