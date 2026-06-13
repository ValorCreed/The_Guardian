package com.vault.theguardian.documents;

import com.vault.theguardian.subscription.Subscription;
import com.vault.theguardian.subscription.SubscriptionPlan;
import com.vault.theguardian.subscription.SubscriptionRepository;
import com.vault.theguardian.user.User;
import org.springframework.stereotype.Service;

import java.time.LocalDateTime;
import java.util.List;

@Service
public class DocumentService {

    private final DocumentRepository documentRepository;
    private final SubscriptionRepository subscriptionRepository;

    public DocumentService(
            DocumentRepository documentRepository,
            SubscriptionRepository subscriptionRepository
    ) {
        this.documentRepository = documentRepository;
        this.subscriptionRepository = subscriptionRepository;
    }

    public DocumentResponse createDocument(User user, DocumentRequest request) {
        /*
         * Document vault is premium/family only.
         */
        Subscription subscription = subscriptionRepository.findByUser(user)
                .orElseThrow(() -> new RuntimeException("Subscription not found"));

        if (subscription.getPlan() == SubscriptionPlan.FREE) {
            throw new RuntimeException("Document vault is only available for Premium and Family users");
        }

        DocumentVault document = DocumentVault.builder()
                .user(user)
                .documentName(request.documentName())
                .documentType(request.documentType())
                .encryptedFileUrl(request.encryptedFileUrl())
                .encryptedNotes(request.encryptedNotes())
                .createdAt(LocalDateTime.now())
                .build();

        DocumentVault saved = documentRepository.save(document);

        return toResponse(saved);
    }

    public List<DocumentResponse> getMyDocuments(User user) {
        return documentRepository.findByUser(user)
                .stream()
                .map(this::toResponse)
                .toList();
    }

    public void deleteDocument(User user, Long id) {
        DocumentVault document = documentRepository.findById(id)
                .orElseThrow(() -> new RuntimeException("Document not found"));

        if (!document.getUser().getId().equals(user.getId())) {
            throw new RuntimeException("You cannot delete this document");
        }

        documentRepository.delete(document);
    }

    private DocumentResponse toResponse(DocumentVault document) {
        return new DocumentResponse(
                document.getId(),
                document.getDocumentName(),
                document.getDocumentType(),
                document.getEncryptedFileUrl(),
                document.getEncryptedNotes()
        );
    }
}