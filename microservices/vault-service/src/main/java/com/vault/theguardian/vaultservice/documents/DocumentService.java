package com.vault.theguardian.vaultservice.documents;

import com.vault.theguardian.vaultservice.notification.NotificationClient;
import com.vault.theguardian.vaultservice.subscription.SubscriptionClient;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
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
import java.text.Normalizer;
import java.time.LocalDateTime;
import java.util.Arrays;
import java.util.Base64;
import java.util.List;
import java.util.UUID;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

@Service
public class DocumentService {

    private static final String NORMAL_PREFIX = "v1";
    private static final String DECOY_PREFIX = "v1d";
    private static final String STORAGE_PROVIDER_B2 = "B2";
    private static final String STORAGE_PROVIDER_DATABASE = "DATABASE";
    private static final byte[] NORMAL_FILE_MAGIC = new byte[]{'T', 'G', 'D', '1'};
    private static final byte[] DECOY_FILE_MAGIC = new byte[]{'T', 'G', 'D', '2'};
    private static final int IV_LENGTH_BYTES = 12;
    private static final int TAG_LENGTH_BITS = 128;
    private static final long MAX_UPLOAD_BYTES = 25L * 1024L * 1024L;
    private static final int MAX_DOCUMENT_NAME_LENGTH = 255;
    private static final int MAX_DOCUMENT_TYPE_LENGTH = 127;
    private static final Pattern LEGACY_BASE64_CONTENT_PATTERN = Pattern.compile("\\\"base64Content\\\"\\s*:\\s*\\\"([^\\\"]*)\\\"");

    private final DocumentRepository documentRepository;
    private final SubscriptionClient subscriptionService;
    private final NotificationClient notificationClient;
    private final B2StorageService b2StorageService;
    private final SecureRandom secureRandom = new SecureRandom();
    private final SecretKeySpec normalDocumentKeySpec;
    private final SecretKeySpec decoyDocumentKeySpec;

    public DocumentService(
            DocumentRepository documentRepository,
            SubscriptionClient subscriptionService,
            NotificationClient notificationClient,
            B2StorageService b2StorageService,
            @Value("${vault.document.secret}") String documentSecret
    ) {
        this.documentRepository = documentRepository;
        this.subscriptionService = subscriptionService;
        this.notificationClient = notificationClient;
        this.b2StorageService = b2StorageService;
        this.normalDocumentKeySpec = buildKey(documentSecret);
        this.decoyDocumentKeySpec = buildKey(documentSecret + "\u0000guardian-decoy-document-v1");
    }

    public DocumentResponse createDocument(Long userId, boolean decoy, DocumentRequest request) {
        requireDocumentUploadAccess(userId);

        String finalDocumentName = validateDocumentName(request.documentName());
        String finalDocumentType = validateDocumentType(request.documentType());
        byte[] fileBytes = decodePossibleBase64File(request.encryptedFileUrl());

        DocumentVault document = DocumentVault.builder()
                .userId(userId)
                .decoy(decoy)
                .documentName(finalDocumentName)
                .documentType(finalDocumentType)
                .encryptedNotes(encryptText(request.encryptedNotes(), decoy))
                .sizeBytes((long) fileBytes.length)
                .createdAt(LocalDateTime.now())
                .build();

        storeFileBytes(userId, decoy, document, fileBytes, finalDocumentName, finalDocumentType);

        DocumentVault savedDocument = documentRepository.save(document);
        if (!decoy) notificationClient.notifyDocumentAdded(userId, savedDocument.getDocumentName());
        return toMetadataResponse(savedDocument);
    }

    public DocumentResponse uploadDocument(
            Long userId,
            boolean decoy,
            MultipartFile file,
            String documentName,
            String documentType,
            Long sizeBytes
    ) throws IOException {
        requireDocumentUploadAccess(userId);

        if (file == null || file.isEmpty()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "No file was uploaded.");
        }

        long actualSize = file.getSize();
        if (actualSize <= 0) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "The uploaded file is empty.");
        }
        if (actualSize > MAX_UPLOAD_BYTES) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "The uploaded file must be 25 MB or smaller.");
        }
        if (sizeBytes != null && sizeBytes > 0 && sizeBytes.longValue() != actualSize) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST,
                    "The declared file size does not match the uploaded file."
            );
        }

        String originalFileName = sanitizeOriginalFileName(file.getOriginalFilename());
        String finalDocumentName = validateDocumentName(
                documentName != null && !documentName.isBlank() ? documentName : originalFileName
        );
        String finalDocumentType = validateDocumentType(
                documentType != null && !documentType.isBlank() ? documentType : file.getContentType()
        );
        long finalSize = actualSize;

        String metadataJson = String.format(
                "{\"originalFileName\":\"%s\",\"sizeBytes\":%d,\"storage\":\"%s\"}",
                escapeJson(originalFileName),
                finalSize,
                b2StorageService.isEnabled() ? STORAGE_PROVIDER_B2 : STORAGE_PROVIDER_DATABASE
        );

        DocumentVault document = DocumentVault.builder()
                .userId(userId)
                .decoy(decoy)
                .documentName(finalDocumentName)
                .documentType(finalDocumentType)
                .encryptedNotes(encryptText(metadataJson, decoy))
                .sizeBytes(finalSize)
                .createdAt(LocalDateTime.now())
                .build();

        storeFileBytes(userId, decoy, document, file.getBytes(), finalDocumentName, finalDocumentType);

        DocumentVault savedDocument = documentRepository.save(document);
        if (!decoy) notificationClient.notifyDocumentAdded(userId, savedDocument.getDocumentName());
        return toMetadataResponse(savedDocument);
    }

    public List<DocumentResponse> getMyDocuments(Long userId, boolean decoy) {
        return documentRepository.findByUserIdAndDecoyOrderByCreatedAtDesc(userId, decoy)
                .stream()
                .map(this::toMetadataResponse)
                .toList();
    }

    public DocumentResponse getDocument(Long userId, boolean decoy, Long id) {
        DocumentVault document = getOwnedDocument(userId, decoy, id);
        return toMetadataResponse(document);
    }

    public byte[] getDocumentBytes(Long userId, boolean decoy, Long id) {
        DocumentVault document = getOwnedDocument(userId, decoy, id);
        return readDocumentBytes(document);
    }

    /**
     * Used by Family/Emergency access after those services have already checked
     * that the signed-in user is allowed to access the owner's document.
     */
    public byte[] getDocumentBytesForSharedAccess(DocumentVault document) {
        return readDocumentBytes(document);
    }

    public String getDownloadFileName(Long userId, boolean decoy, Long id) {
        DocumentVault document = getOwnedDocument(userId, decoy, id);
        return getDownloadFileNameForSharedAccess(document);
    }

    public String getDownloadFileNameForSharedAccess(DocumentVault document) {
        return cleanDownloadFileName(document.getDocumentName());
    }

    public String getDownloadContentType(Long userId, boolean decoy, Long id) {
        DocumentVault document = getOwnedDocument(userId, decoy, id);
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
                return decryptFileBytes(encryptedBytes, document.isDecoy());
            } catch (ResponseStatusException error) {
                throw error;
            } catch (Exception error) {
                throw new ResponseStatusException(HttpStatus.INTERNAL_SERVER_ERROR, "Document could not be downloaded from secure storage.");
            }
        }

        String decryptedValue = decryptTextForResponse(document.getEncryptedFileUrl(), document.isDecoy());
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

    public DocumentResponse updateDocument(Long userId, boolean decoy, Long id, DocumentRequest request) {
        requireDocumentUploadAccess(userId);

        DocumentVault document = getOwnedDocument(userId, decoy, id);

        document.setDocumentName(validateDocumentName(request.documentName()));
        document.setDocumentType(validateDocumentType(request.documentType()));

        if (request.encryptedFileUrl() != null && !request.encryptedFileUrl().isBlank()) {
            byte[] fileBytes = decodePossibleBase64File(request.encryptedFileUrl());
            String oldStorageKey = document.getStorageKey();
            boolean oldWasB2 = isB2Document(document);

            storeFileBytes(userId, decoy, document, fileBytes, document.getDocumentName(), document.getDocumentType());

            if (oldWasB2 && oldStorageKey != null && !oldStorageKey.equals(document.getStorageKey())) {
                b2StorageService.deleteObjectQuietly(oldStorageKey);
            }
        }

        document.setEncryptedNotes(encryptText(request.encryptedNotes(), decoy));

        DocumentVault savedDocument = documentRepository.save(document);
        return toMetadataResponse(savedDocument);
    }

    public void deleteDocument(Long userId, boolean decoy, Long id) {
        DocumentVault document = getOwnedDocument(userId, decoy, id);
        String storageKey = document.getStorageKey();
        boolean wasB2Document = isB2Document(document);

        documentRepository.delete(document);

        if (wasB2Document) {
            b2StorageService.deleteObjectQuietly(storageKey);
        }
    }

    private void storeFileBytes(
            Long userId,
            boolean decoy,
            DocumentVault document,
            byte[] fileBytes,
            String documentName,
            String documentType
    ) {
        if (fileBytes == null || fileBytes.length == 0) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Document file data is missing.");
        }

        if (b2StorageService.isEnabled()) {
            String storageKey = buildStorageKey(userId, documentName, decoy);
            byte[] encryptedBytes = encryptFileBytes(fileBytes, decoy);
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
        document.setEncryptedFileUrl(encryptText(base64File, decoy));
        document.setSizeBytes((long) fileBytes.length);
    }

    private boolean isB2Document(DocumentVault document) {
        return STORAGE_PROVIDER_B2.equalsIgnoreCase(String.valueOf(document.getStorageProvider()))
                && document.getStorageKey() != null
                && !document.getStorageKey().isBlank();
    }

    private DocumentVault getOwnedDocument(Long userId, boolean decoy, Long id) {
        return documentRepository.findByIdAndUserIdAndDecoy(id, userId, decoy)
                .orElseThrow(() -> new ResponseStatusException(
                        HttpStatus.NOT_FOUND,
                        "Document not found."
                ));
    }

    private void requireDocumentUploadAccess(Long userId) {
        if (!subscriptionService.canUploadDocuments(userId)) {
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
                decryptTextForResponse(document.getEncryptedNotes(), document.isDecoy()),
                document.getSizeBytes(),
                document.getCreatedAt(),
                document.getCreatedAt()
        );
    }

    private String buildStorageKey(Long userId, String documentName, boolean decoy) {
        String safeName = cleanDownloadFileName(documentName);
        return "users/" + userId + (decoy ? "/decoy-documents/" : "/documents/")
                + UUID.randomUUID() + "/" + safeName + ".enc";
    }

    private byte[] encryptFileBytes(byte[] plainBytes, boolean decoy) {
        try {
            byte[] iv = new byte[IV_LENGTH_BYTES];
            secureRandom.nextBytes(iv);

            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(
                    Cipher.ENCRYPT_MODE,
                    keyFor(decoy),
                    new GCMParameterSpec(TAG_LENGTH_BITS, iv)
            );
            byte[] encrypted = cipher.doFinal(plainBytes);
            byte[] magic = decoy ? DECOY_FILE_MAGIC : NORMAL_FILE_MAGIC;

            return ByteBuffer.allocate(magic.length + IV_LENGTH_BYTES + encrypted.length)
                    .put(magic)
                    .put(iv)
                    .put(encrypted)
                    .array();
        } catch (Exception error) {
            throw new RuntimeException("Could not encrypt document file.", error);
        }
    }

    private byte[] decryptFileBytes(byte[] storedBytes, boolean decoy) {
        int magicLength = NORMAL_FILE_MAGIC.length;
        if (storedBytes == null || storedBytes.length < magicLength + IV_LENGTH_BYTES + 1) {
            throw new ResponseStatusException(HttpStatus.INTERNAL_SERVER_ERROR, "Document file data is invalid.");
        }

        try {
            byte[] magic = Arrays.copyOfRange(storedBytes, 0, magicLength);
            byte[] expectedMagic = decoy ? DECOY_FILE_MAGIC : NORMAL_FILE_MAGIC;
            byte[] otherMagic = decoy ? NORMAL_FILE_MAGIC : DECOY_FILE_MAGIC;

            if (Arrays.equals(magic, otherMagic)) {
                throw new ResponseStatusException(
                        HttpStatus.NOT_FOUND,
                        "Document is not available in this vault session."
                );
            }

            if (!Arrays.equals(magic, expectedMagic)) {
                /* Only normal vaults may read the legacy text-wrapped format. */
                if (decoy) {
                    throw new ResponseStatusException(
                            HttpStatus.NOT_FOUND,
                            "Document is not available in this vault session."
                    );
                }
                String asText = new String(storedBytes, StandardCharsets.UTF_8);
                String decrypted = decryptTextForResponse(asText, false);
                String base64File = extractBase64FileContent(decrypted);
                return Base64.getDecoder().decode(base64File);
            }

            byte[] iv = Arrays.copyOfRange(storedBytes, magicLength, magicLength + IV_LENGTH_BYTES);
            byte[] encrypted = Arrays.copyOfRange(storedBytes, magicLength + IV_LENGTH_BYTES, storedBytes.length);

            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(
                    Cipher.DECRYPT_MODE,
                    keyFor(decoy),
                    new GCMParameterSpec(TAG_LENGTH_BITS, iv)
            );
            return cipher.doFinal(encrypted);
        } catch (ResponseStatusException error) {
            throw error;
        } catch (Exception error) {
            throw new ResponseStatusException(HttpStatus.INTERNAL_SERVER_ERROR, "Document file could not be decrypted.");
        }
    }

    private String encryptText(String plainText, boolean decoy) {
        if (plainText == null || plainText.isBlank()) {
            return plainText;
        }

        try {
            byte[] iv = new byte[IV_LENGTH_BYTES];
            secureRandom.nextBytes(iv);

            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(
                    Cipher.ENCRYPT_MODE,
                    keyFor(decoy),
                    new GCMParameterSpec(TAG_LENGTH_BITS, iv)
            );

            byte[] encrypted = cipher.doFinal(plainText.getBytes(StandardCharsets.UTF_8));
            String prefix = decoy ? DECOY_PREFIX : NORMAL_PREFIX;

            return prefix + ":" +
                    Base64.getUrlEncoder().withoutPadding().encodeToString(iv) + ":" +
                    Base64.getUrlEncoder().withoutPadding().encodeToString(encrypted);
        } catch (Exception error) {
            throw new RuntimeException("Could not encrypt document data.", error);
        }
    }

    private String decryptTextForResponse(String storedText, boolean decoy) {
        if (storedText == null || storedText.isBlank()) {
            return storedText;
        }

        String expectedPrefix = decoy ? DECOY_PREFIX : NORMAL_PREFIX;
        String otherPrefix = decoy ? NORMAL_PREFIX : DECOY_PREFIX;
        if (storedText.startsWith(otherPrefix + ":")) {
            return "";
        }

        try {
            if (storedText.startsWith(expectedPrefix + ":")) {
                String[] parts = storedText.split(":", 3);
                if (parts.length != 3) return "";

                byte[] iv = Base64.getUrlDecoder().decode(parts[1]);
                byte[] encrypted = Base64.getUrlDecoder().decode(parts[2]);

                Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
                cipher.init(
                        Cipher.DECRYPT_MODE,
                        keyFor(decoy),
                        new GCMParameterSpec(TAG_LENGTH_BITS, iv)
                );
                byte[] decrypted = cipher.doFinal(encrypted);
                return new String(decrypted, StandardCharsets.UTF_8);
            }

            /* Legacy document metadata belongs only to the normal vault. */
            if (decoy) return "";

            if (storedText.contains(":")) {
                String[] parts = storedText.split(":", 2);
                byte[] iv = Base64.getDecoder().decode(parts[0]);
                byte[] encrypted = Base64.getDecoder().decode(parts[1]);

                Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
                cipher.init(
                        Cipher.DECRYPT_MODE,
                        normalDocumentKeySpec,
                        new GCMParameterSpec(TAG_LENGTH_BITS, iv)
                );
                byte[] decrypted = cipher.doFinal(encrypted);
                return new String(decrypted, StandardCharsets.UTF_8);
            }

            return storedText;
        } catch (Exception error) {
            return "";
        }
    }

    private SecretKeySpec keyFor(boolean decoy) {
        return decoy ? decoyDocumentKeySpec : normalDocumentKeySpec;
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

    private String validateDocumentName(String value) {
        String sanitized = sanitizeMetadataText(value);
        if (sanitized.isBlank()) {
            return "Untitled document";
        }
        if (sanitized.length() > MAX_DOCUMENT_NAME_LENGTH) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST,
                    "Document name must be 255 characters or fewer."
            );
        }
        return sanitized;
    }

    private String validateDocumentType(String value) {
        String normalized = value == null || value.isBlank()
                ? MediaType.APPLICATION_OCTET_STREAM_VALUE
                : value.trim();
        if (normalized.length() > MAX_DOCUMENT_TYPE_LENGTH) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST,
                    "Document type must be 127 characters or fewer."
            );
        }
        try {
            return MediaType.parseMediaType(normalized).toString();
        } catch (IllegalArgumentException exception) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Document type is not a valid MIME type.");
        }
    }

    private String sanitizeOriginalFileName(String value) {
        if (value == null || value.isBlank()) return "document";
        String fileName = value.replace('\\', '/');
        int separator = fileName.lastIndexOf('/');
        if (separator >= 0) fileName = fileName.substring(separator + 1);
        String sanitized = sanitizeMetadataText(fileName);
        if (sanitized.isBlank()) return "document";
        return sanitized.length() <= MAX_DOCUMENT_NAME_LENGTH
                ? sanitized
                : sanitized.substring(0, MAX_DOCUMENT_NAME_LENGTH);
    }

    private String sanitizeMetadataText(String value) {
        if (value == null) return "";
        String normalized = Normalizer.normalize(value, Normalizer.Form.NFKC);
        StringBuilder sanitized = new StringBuilder(normalized.length());
        for (int index = 0; index < normalized.length(); ) {
            int codePoint = normalized.codePointAt(index);
            index += Character.charCount(codePoint);
            boolean unsafeDirection = (codePoint >= 0x202A && codePoint <= 0x202E)
                    || (codePoint >= 0x2066 && codePoint <= 0x2069)
                    || codePoint == 0x200B
                    || codePoint == 0x2060
                    || codePoint == 0xFEFF;
            if (unsafeDirection || Character.isISOControl(codePoint)) continue;
            if (codePoint == '<' || codePoint == '>') continue;
            sanitized.appendCodePoint(codePoint);
        }
        return sanitized.toString().trim();
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
