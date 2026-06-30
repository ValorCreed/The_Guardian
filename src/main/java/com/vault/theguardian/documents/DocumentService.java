package com.vault.theguardian.documents;

import com.vault.theguardian.notification.NotificationService;
import com.vault.theguardian.subscription.SubscriptionService;
import com.vault.theguardian.user.User;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.server.ResponseStatusException;

import javax.crypto.Cipher;
import javax.crypto.spec.GCMParameterSpec;
import javax.crypto.spec.SecretKeySpec;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.time.LocalDateTime;
import java.util.Base64;
import java.util.List;

@Service
public class DocumentService {

    private final DocumentRepository documentRepository;
    private final SubscriptionService subscriptionService;
    private final NotificationService notificationService;

    @Value("${vault.document.secret:change-this-document-secret}")
    private String documentSecret;

    public DocumentService(
            DocumentRepository documentRepository,
            SubscriptionService subscriptionService,
            NotificationService notificationService
    ) {
        this.documentRepository = documentRepository;
        this.subscriptionService = subscriptionService;
        this.notificationService = notificationService;
    }

    public DocumentResponse createDocument(User user, DocumentRequest request) {
        requireDocumentUploadAccess(user);

        DocumentVault document = DocumentVault.builder()
                .user(user)
                .documentName(request.documentName())
                .documentType(request.documentType())
                .encryptedFileUrl(encryptText(request.encryptedFileUrl()))
                .encryptedNotes(request.encryptedNotes())
                .createdAt(LocalDateTime.now())
                .build();

        DocumentVault savedDocument = documentRepository.save(document);
        notificationService.notifyDocumentAdded(user, savedDocument.getDocumentName());
        return toResponse(savedDocument);
    }

    public DocumentResponse uploadDocument(
            User user,
            MultipartFile file,
            String documentName,
            String documentType,
            Long sizeBytes
    ) throws IOException {
        requireDocumentUploadAccess(user);

        if (file == null || file.isEmpty()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "No file was uploaded.");
        }

        String finalDocumentName =
                documentName != null && !documentName.isBlank()
                        ? documentName.trim()
                        : file.getOriginalFilename();

        if (finalDocumentName == null || finalDocumentName.isBlank()) {
            finalDocumentName = "Untitled document";
        }

        String finalDocumentType =
                documentType != null && !documentType.isBlank()
                        ? documentType
                        : file.getContentType();

        if (finalDocumentType == null || finalDocumentType.isBlank()) {
            finalDocumentType = "application/octet-stream";
        }

        long finalSize = sizeBytes != null && sizeBytes > 0
                ? sizeBytes
                : file.getSize();

        String base64File = Base64.getEncoder().encodeToString(file.getBytes());
        String encryptedBase64File = encryptText(base64File);

        String metadataJson = String.format(
                "{\"originalFileName\":\"%s\",\"sizeBytes\":%d}",
                escapeJson(file.getOriginalFilename()),
                finalSize
        );

        DocumentVault document = DocumentVault.builder()
                .user(user)
                .documentName(finalDocumentName)
                .documentType(finalDocumentType)
                .encryptedFileUrl(encryptedBase64File)
                .encryptedNotes(metadataJson)
                .createdAt(LocalDateTime.now())
                .build();

        DocumentVault savedDocument = documentRepository.save(document);
        notificationService.notifyDocumentAdded(user, savedDocument.getDocumentName());
        return toResponse(savedDocument);
    }

    public List<DocumentResponse> getMyDocuments(User user) {
        return documentRepository.findByUser(user)
                .stream()
                .map(this::toResponseWithoutFileData)
                .toList();
    }

    public DocumentResponse getDocument(User user, Long id) {
        DocumentVault document = getOwnedDocument(user, id);
        return toResponse(document);
    }

    public DocumentResponse updateDocument(User user, Long id, DocumentRequest request) {
        requireDocumentUploadAccess(user);

        DocumentVault document = getOwnedDocument(user, id);

        document.setDocumentName(request.documentName());
        document.setDocumentType(request.documentType());
        document.setEncryptedFileUrl(encryptText(request.encryptedFileUrl()));
        document.setEncryptedNotes(request.encryptedNotes());

        DocumentVault savedDocument = documentRepository.save(document);
        return toResponse(savedDocument);
    }

    public void deleteDocument(User user, Long id) {
        DocumentVault document = getOwnedDocument(user, id);
        documentRepository.delete(document);
    }

    private DocumentVault getOwnedDocument(User user, Long id) {
        DocumentVault document = documentRepository.findById(id)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Document not found."));

        if (!document.getUser().getId().equals(user.getId())) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "You cannot access this document.");
        }

        return document;
    }

    private void requireDocumentUploadAccess(User user) {
        if (!subscriptionService.canUploadDocuments(user)) {
            throw new ResponseStatusException(
                    HttpStatus.FORBIDDEN,
                    "Document upload is only available on the Premium and Family plans."
            );
        }
    }

    private DocumentResponse toResponse(DocumentVault document) {
        return new DocumentResponse(
                document.getId(),
                document.getDocumentName(),
                document.getDocumentType(),
                decryptTextIfPossible(document.getEncryptedFileUrl()),
                document.getEncryptedNotes()
        );
    }

    private DocumentResponse toResponseWithoutFileData(DocumentVault document) {
        return new DocumentResponse(
                document.getId(),
                document.getDocumentName(),
                document.getDocumentType(),
                "",
                document.getEncryptedNotes()
        );
    }

    private String encryptText(String plainText) {
        try {
            if (plainText == null) {
                plainText = "";
            }

            byte[] iv = new byte[12];
            new SecureRandom().nextBytes(iv);

            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(Cipher.ENCRYPT_MODE, getSecretKey(), new GCMParameterSpec(128, iv));

            byte[] encrypted = cipher.doFinal(plainText.getBytes(StandardCharsets.UTF_8));

            return Base64.getEncoder().encodeToString(iv) + ":" +
                    Base64.getEncoder().encodeToString(encrypted);
        } catch (Exception e) {
            throw new RuntimeException("Could not encrypt document");
        }
    }

    private String decryptTextIfPossible(String storedText) {
        try {
            if (storedText == null || !storedText.contains(":")) {
                return storedText;
            }

            String[] parts = storedText.split(":", 2);
            byte[] iv = Base64.getDecoder().decode(parts[0]);
            byte[] encrypted = Base64.getDecoder().decode(parts[1]);

            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(Cipher.DECRYPT_MODE, getSecretKey(), new GCMParameterSpec(128, iv));

            byte[] decrypted = cipher.doFinal(encrypted);
            return new String(decrypted, StandardCharsets.UTF_8);
        } catch (Exception e) {
            return storedText;
        }
    }

    private SecretKeySpec getSecretKey() throws Exception {
        MessageDigest digest = MessageDigest.getInstance("SHA-256");
        byte[] key = digest.digest(documentSecret.getBytes(StandardCharsets.UTF_8));
        return new SecretKeySpec(key, "AES");
    }

    private String escapeJson(String value) {
        if (value == null) return "";
        return value.replace("\\", "\\\\").replace("\"", "\\\"");
    }
}