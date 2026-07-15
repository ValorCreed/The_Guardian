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
import java.nio.ByteBuffer;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.time.LocalDateTime;
import java.util.Arrays;
import java.util.Base64;
import java.util.List;
import java.util.UUID;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

@Service
public class DocumentService {

    private static final String PREFIX = "v1";
    private static final String STORAGE_PROVIDER_B2 = "B2";
    private static final String STORAGE_PROVIDER_DATABASE = "DATABASE";
    private static final byte[] FILE_MAGIC = new byte[]{'T', 'G', 'D', '1'};
    private static final int IV_LENGTH_BYTES = 12;
    private static final int TAG_LENGTH_BITS = 128;
    private static final Pattern LEGACY_BASE64_CONTENT_PATTERN = Pattern.compile("\\\"base64Content\\\"\\s*:\\s*\\\"([^\\\"]*)\\\"");

    private final DocumentRepository documentRepository;
    private final SubscriptionService subscriptionService;
    private final NotificationService notificationService;
    private final B2StorageService b2StorageService;
    private final SecureRandom secureRandom = new SecureRandom();
    private final SecretKeySpec documentKeySpec;

    public DocumentService(
            DocumentRepository documentRepository,
            SubscriptionService subscriptionService,
            NotificationService notificationService,
            B2StorageService b2StorageService,
            @Value("${vault.document.secret}") String documentSecret
    ) {
        this.documentRepository = documentRepository;
        this.subscriptionService = subscriptionService;
        this.notificationService = notificationService;
        this.b2StorageService = b2StorageService;
        this.documentKeySpec = buildKey(documentSecret);
    }

    public DocumentResponse createDocument(User user, DocumentRequest request) {
        requireDocumentUploadAccess(user);

        String finalDocumentName = cleanDocumentName(request.documentName());
        String finalDocumentType = cleanDocumentType(request.documentType());
        byte[] fileBytes = decodePossibleBase64File(request.encryptedFileUrl());

        DocumentVault document = DocumentVault.builder()
                .user(user)
                .documentName(finalDocumentName)
                .documentType(finalDocumentType)
                .encryptedNotes(encryptText(request.encryptedNotes()))
                .sizeBytes((long) fileBytes.length)
                .createdAt(LocalDateTime.now())
                .build();

        storeFileBytes(user, document, fileBytes, finalDocumentName, finalDocumentType);

        DocumentVault savedDocument = documentRepository.save(document);
        notificationService.notifyDocumentAdded(user, savedDocument.getDocumentName());
        return toMetadataResponse(savedDocument);
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

        String finalDocumentName = documentName != null && !documentName.isBlank()
                ? documentName.trim()
                : file.getOriginalFilename();

        if (finalDocumentName == null || finalDocumentName.isBlank()) {
            finalDocumentName = "Untitled document";
        }

        String finalDocumentType = documentType != null && !documentType.isBlank()
                ? documentType.trim()
                : file.getContentType();

        if (finalDocumentType == null || finalDocumentType.isBlank()) {
            finalDocumentType = "application/octet-stream";
        }

        long finalSize = sizeBytes != null && sizeBytes > 0 ? sizeBytes : file.getSize();

        String metadataJson = String.format(
                "{\"originalFileName\":\"%s\",\"sizeBytes\":%d,\"storage\":\"%s\"}",
                escapeJson(file.getOriginalFilename()),
                finalSize,
                b2StorageService.isEnabled() ? STORAGE_PROVIDER_B2 : STORAGE_PROVIDER_DATABASE
        );

        DocumentVault document = DocumentVault.builder()
                .user(user)
                .documentName(finalDocumentName)
                .documentType(finalDocumentType)
                .encryptedNotes(encryptText(metadataJson))
                .sizeBytes(finalSize)
                .createdAt(LocalDateTime.now())
                .build();

        storeFileBytes(user, document, file.getBytes(), finalDocumentName, finalDocumentType);

        DocumentVault savedDocument = documentRepository.save(document);
        notificationService.notifyDocumentAdded(user, savedDocument.getDocumentName());
        return toMetadataResponse(savedDocument);
    }

    public List<DocumentResponse> getMyDocuments(User user) {
        return documentRepository.findByUser(user)
                .stream()
                .map(this::toMetadataResponse)
                .toList();
    }

    public DocumentResponse getDocument(User user, Long id) {
        DocumentVault document = getOwnedDocument(user, id);
        return toMetadataResponse(document);
    }

    public byte[] getDocumentBytes(User user, Long id) {
        DocumentVault document = getOwnedDocument(user, id);
        return readDocumentBytes(document);
    }

    /**
     * Used by Family/Emergency access after those services have already checked
     * that the signed-in user is allowed to access the owner's document.
     */
    public byte[] getDocumentBytesForSharedAccess(DocumentVault document) {
        return readDocumentBytes(document);
    }

    public String getDownloadFileName(User user, Long id) {
        DocumentVault document = getOwnedDocument(user, id);
        return getDownloadFileNameForSharedAccess(document);
    }

    public String getDownloadFileNameForSharedAccess(DocumentVault document) {
        return cleanDownloadFileName(document.getDocumentName());
    }

    public String getDownloadContentType(User user, Long id) {
        DocumentVault document = getOwnedDocument(user, id);
        return getDownloadContentTypeForSharedAccess(document);
    }

    public String getDownloadContentTypeForSharedAccess(DocumentVault document) {
        return cleanDocumentType(document.getDocumentType());
    }

    private byte[] readDocumentBytes(DocumentVault document) {
        if (document == null) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Document not found.");
        }

        if (isB2Document(document)) {
            try {
                byte[] encryptedBytes = b2StorageService.getEncryptedObject(document.getStorageKey());
                return decryptFileBytes(encryptedBytes);
            } catch (ResponseStatusException error) {
                throw error;
            } catch (Exception error) {
                throw new ResponseStatusException(HttpStatus.INTERNAL_SERVER_ERROR, "Document could not be downloaded from secure storage.");
            }
        }

        String decryptedValue = decryptTextForResponse(document.getEncryptedFileUrl());
        String base64File = extractBase64FileContent(decryptedValue);

        if (base64File == null || base64File.isBlank()) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Document file data is missing.");
        }

        try {
            return Base64.getDecoder().decode(base64File);
        } catch (IllegalArgumentException error) {
            throw new ResponseStatusException(HttpStatus.INTERNAL_SERVER_ERROR, "Document file data could not be decoded.");
        }
    }

    public DocumentResponse updateDocument(User user, Long id, DocumentRequest request) {
        requireDocumentUploadAccess(user);

        DocumentVault document = getOwnedDocument(user, id);

        document.setDocumentName(cleanDocumentName(request.documentName()));
        document.setDocumentType(cleanDocumentType(request.documentType()));

        if (request.encryptedFileUrl() != null && !request.encryptedFileUrl().isBlank()) {
            byte[] fileBytes = decodePossibleBase64File(request.encryptedFileUrl());
            String oldStorageKey = document.getStorageKey();
            boolean oldWasB2 = isB2Document(document);

            storeFileBytes(user, document, fileBytes, document.getDocumentName(), document.getDocumentType());

            if (oldWasB2 && oldStorageKey != null && !oldStorageKey.equals(document.getStorageKey())) {
                b2StorageService.deleteObjectQuietly(oldStorageKey);
            }
        }

        document.setEncryptedNotes(encryptText(request.encryptedNotes()));

        DocumentVault savedDocument = documentRepository.save(document);
        return toMetadataResponse(savedDocument);
    }

    public void deleteDocument(User user, Long id) {
        DocumentVault document = getOwnedDocument(user, id);
        String storageKey = document.getStorageKey();
        boolean wasB2Document = isB2Document(document);

        documentRepository.delete(document);

        if (wasB2Document) {
            b2StorageService.deleteObjectQuietly(storageKey);
        }
    }

    private void storeFileBytes(
            User user,
            DocumentVault document,
            byte[] fileBytes,
            String documentName,
            String documentType
    ) {
        if (fileBytes == null || fileBytes.length == 0) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Document file data is missing.");
        }

        if (b2StorageService.isEnabled()) {
            String storageKey = buildStorageKey(user, documentName);
            byte[] encryptedBytes = encryptFileBytes(fileBytes);
            b2StorageService.putEncryptedObject(storageKey, encryptedBytes, documentType);

            document.setStorageProvider(STORAGE_PROVIDER_B2);
            document.setStorageKey(storageKey);
            document.setEncryptedFileUrl("");
            document.setSizeBytes((long) fileBytes.length);
            return;
        }

        String base64File = Base64.getEncoder().encodeToString(fileBytes);
        document.setStorageProvider(STORAGE_PROVIDER_DATABASE);
        document.setStorageKey(null);
        document.setEncryptedFileUrl(encryptText(base64File));
        document.setSizeBytes((long) fileBytes.length);
    }

    private boolean isB2Document(DocumentVault document) {
        return STORAGE_PROVIDER_B2.equalsIgnoreCase(String.valueOf(document.getStorageProvider()))
                && document.getStorageKey() != null
                && !document.getStorageKey().isBlank();
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

    private DocumentResponse toMetadataResponse(DocumentVault document) {
        return new DocumentResponse(
                document.getId(),
                document.getDocumentName(),
                document.getDocumentType(),
                "",
                decryptTextForResponse(document.getEncryptedNotes())
        );
    }

    private String buildStorageKey(User user, String documentName) {
        String safeName = cleanDownloadFileName(documentName);
        return "users/" + user.getId() + "/documents/" + UUID.randomUUID() + "/" + safeName + ".enc";
    }

    private byte[] encryptFileBytes(byte[] plainBytes) {
        try {
            byte[] iv = new byte[IV_LENGTH_BYTES];
            secureRandom.nextBytes(iv);

            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(Cipher.ENCRYPT_MODE, documentKeySpec, new GCMParameterSpec(TAG_LENGTH_BITS, iv));
            byte[] encrypted = cipher.doFinal(plainBytes);

            return ByteBuffer.allocate(FILE_MAGIC.length + IV_LENGTH_BYTES + encrypted.length)
                    .put(FILE_MAGIC)
                    .put(iv)
                    .put(encrypted)
                    .array();
        } catch (Exception error) {
            throw new RuntimeException("Could not encrypt document file.", error);
        }
    }

    private byte[] decryptFileBytes(byte[] storedBytes) {
        if (storedBytes == null || storedBytes.length < FILE_MAGIC.length + IV_LENGTH_BYTES + 1) {
            throw new ResponseStatusException(HttpStatus.INTERNAL_SERVER_ERROR, "Document file data is invalid.");
        }

        try {
            byte[] magic = Arrays.copyOfRange(storedBytes, 0, FILE_MAGIC.length);
            if (!Arrays.equals(magic, FILE_MAGIC)) {
                String asText = new String(storedBytes, StandardCharsets.UTF_8);
                String decrypted = decryptTextForResponse(asText);
                String base64File = extractBase64FileContent(decrypted);
                return Base64.getDecoder().decode(base64File);
            }

            byte[] iv = Arrays.copyOfRange(storedBytes, FILE_MAGIC.length, FILE_MAGIC.length + IV_LENGTH_BYTES);
            byte[] encrypted = Arrays.copyOfRange(storedBytes, FILE_MAGIC.length + IV_LENGTH_BYTES, storedBytes.length);

            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(Cipher.DECRYPT_MODE, documentKeySpec, new GCMParameterSpec(TAG_LENGTH_BITS, iv));
            return cipher.doFinal(encrypted);
        } catch (ResponseStatusException error) {
            throw error;
        } catch (Exception error) {
            throw new ResponseStatusException(HttpStatus.INTERNAL_SERVER_ERROR, "Document file could not be decrypted.");
        }
    }

    private String encryptText(String plainText) {
        if (plainText == null || plainText.isBlank()) {
            return plainText;
        }

        try {
            byte[] iv = new byte[IV_LENGTH_BYTES];
            secureRandom.nextBytes(iv);

            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(Cipher.ENCRYPT_MODE, documentKeySpec, new GCMParameterSpec(TAG_LENGTH_BITS, iv));

            byte[] encrypted = cipher.doFinal(plainText.getBytes(StandardCharsets.UTF_8));

            return PREFIX + ":" +
                    Base64.getUrlEncoder().withoutPadding().encodeToString(iv) + ":" +
                    Base64.getUrlEncoder().withoutPadding().encodeToString(encrypted);
        } catch (Exception error) {
            throw new RuntimeException("Could not encrypt document data.", error);
        }
    }

    private String decryptTextForResponse(String storedText) {
        if (storedText == null || storedText.isBlank()) {
            return storedText;
        }

        try {
            if (storedText.startsWith(PREFIX + ":")) {
                String[] parts = storedText.split(":", 3);

                if (parts.length != 3) return "";

                byte[] iv = Base64.getUrlDecoder().decode(parts[1]);
                byte[] encrypted = Base64.getUrlDecoder().decode(parts[2]);

                Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
                cipher.init(Cipher.DECRYPT_MODE, documentKeySpec, new GCMParameterSpec(TAG_LENGTH_BITS, iv));

                byte[] decrypted = cipher.doFinal(encrypted);
                return new String(decrypted, StandardCharsets.UTF_8);
            }

            if (storedText.contains(":")) {
                String[] parts = storedText.split(":", 2);
                byte[] iv = Base64.getDecoder().decode(parts[0]);
                byte[] encrypted = Base64.getDecoder().decode(parts[1]);

                Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
                cipher.init(Cipher.DECRYPT_MODE, documentKeySpec, new GCMParameterSpec(TAG_LENGTH_BITS, iv));

                byte[] decrypted = cipher.doFinal(encrypted);
                return new String(decrypted, StandardCharsets.UTF_8);
            }

            return storedText;
        } catch (Exception error) {
            return "";
        }
    }

    private byte[] decodePossibleBase64File(String value) {
        String base64Value = extractBase64FileContent(value);

        if (base64Value == null || base64Value.isBlank()) {
            return new byte[0];
        }

        try {
            return Base64.getDecoder().decode(base64Value);
        } catch (IllegalArgumentException error) {
            return base64Value.getBytes(StandardCharsets.UTF_8);
        }
    }

    private String extractBase64FileContent(String decryptedValue) {
        if (decryptedValue == null) return "";

        String trimmed = decryptedValue.trim();

        if (trimmed.startsWith("{") && trimmed.contains("base64Content")) {
            Matcher matcher = LEGACY_BASE64_CONTENT_PATTERN.matcher(trimmed);
            if (matcher.find()) {
                return matcher.group(1);
            }
        }

        return trimmed;
    }

    private SecretKeySpec buildKey(String documentSecret) {
        if (documentSecret == null || documentSecret.isBlank() || documentSecret.length() < 32) {
            throw new IllegalStateException(
                    "vault.document.secret must be set and should be at least 32 characters long."
            );
        }

        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            byte[] key = digest.digest(documentSecret.getBytes(StandardCharsets.UTF_8));
            return new SecretKeySpec(key, "AES");
        } catch (Exception error) {
            throw new IllegalStateException("Could not initialize document encryption.", error);
        }
    }

    private String cleanDocumentName(String value) {
        if (value == null || value.trim().isBlank()) {
            return "Untitled document";
        }
        return value.trim();
    }

    private String cleanDocumentType(String value) {
        if (value == null || value.trim().isBlank()) {
            return "application/octet-stream";
        }
        return value.trim();
    }

    private String cleanDownloadFileName(String value) {
        String name = cleanDocumentName(value);
        return name.replaceAll("[^a-zA-Z0-9._-]", "_");
    }

    private String escapeJson(String value) {
        if (value == null) return "";
        return value.replace("\\", "\\\\").replace("\"", "\\\"");
    }
}
