package com.vault.theguardian.vaultservice.internal;

import com.vault.theguardian.vaultservice.cards.CreditCardEntity;
import com.vault.theguardian.vaultservice.cards.CreditCardRepository;
import com.vault.theguardian.vaultservice.documents.DocumentRepository;
import com.vault.theguardian.vaultservice.documents.DocumentResponse;
import com.vault.theguardian.vaultservice.documents.DocumentService;
import com.vault.theguardian.vaultservice.documents.DocumentVault;
import com.vault.theguardian.vaultservice.notes.SecureNote;
import com.vault.theguardian.vaultservice.notes.SecureNoteRepository;
import com.vault.theguardian.vaultservice.vault.VaultCryptoService;
import com.vault.theguardian.vaultservice.vault.VaultItem;
import com.vault.theguardian.vaultservice.vault.VaultItemRepository;
import jakarta.transaction.Transactional;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

import java.time.LocalDateTime;
import java.time.temporal.ChronoUnit;
import java.util.*;

@Service
public class InternalVaultService {
    private static final int PASSWORD_OLD_DAYS = 180;

    private final VaultItemRepository vaultRepository;
    private final CreditCardRepository cardRepository;
    private final DocumentRepository documentRepository;
    private final SecureNoteRepository noteRepository;
    private final VaultCryptoService cryptoService;
    private final DocumentService documentService;

    public InternalVaultService(
            VaultItemRepository vaultRepository,
            CreditCardRepository cardRepository,
            DocumentRepository documentRepository,
            SecureNoteRepository noteRepository,
            VaultCryptoService cryptoService,
            DocumentService documentService
    ) {
        this.vaultRepository = vaultRepository;
        this.cardRepository = cardRepository;
        this.documentRepository = documentRepository;
        this.noteRepository = noteRepository;
        this.cryptoService = cryptoService;
        this.documentService = documentService;
    }

    public List<InternalVaultItemResponse> list(Long ownerId, String itemType) {
        return switch (normalizeType(itemType)) {
            case "PASSWORD" -> vaultRepository.findByUserIdOrderByUpdatedAtDesc(ownerId)
                    .stream()
                    .map(item -> password(item, false))
                    .toList();
            case "CARD" -> cardRepository.findByUserIdOrderByCreatedAtDesc(ownerId)
                    .stream()
                    .map(card -> card(card, false))
                    .toList();
            case "DOCUMENT" -> documentRepository.findByUserIdOrderByCreatedAtDesc(ownerId)
                    .stream()
                    .map(document -> document(document, false))
                    .toList();
            case "NOTE" -> noteRepository.findByUserIdOrderByPinnedDescUpdatedAtDesc(ownerId)
                    .stream()
                    .map(note -> note(note, false))
                    .toList();
            default -> throw badType();
        };
    }

    public InternalVaultItemResponse get(
            Long ownerId,
            String itemType,
            Long itemId
    ) {
        return switch (normalizeType(itemType)) {
            case "PASSWORD" -> password(
                    requireOwner(vaultRepository.findById(itemId)
                            .orElseThrow(() -> notFound("Password")), ownerId),
                    true
            );
            case "CARD" -> card(
                    requireOwner(cardRepository.findById(itemId)
                            .orElseThrow(() -> notFound("Card")), ownerId),
                    true
            );
            case "DOCUMENT" -> document(
                    requireOwner(documentRepository.findById(itemId)
                            .orElseThrow(() -> notFound("Document")), ownerId),
                    true
            );
            case "NOTE" -> note(
                    requireOwner(noteRepository.findById(itemId)
                            .orElseThrow(() -> notFound("Secure note")), ownerId),
                    true
            );
            default -> throw badType();
        };
    }

    public InternalDownloadedDocument download(Long ownerId, Long itemId) {
        byte[] bytes = documentService.getDocumentBytes(ownerId, itemId);
        String fileName = documentService.getDownloadFileName(ownerId, itemId);
        String contentType = documentService.getDownloadContentType(ownerId, itemId);
        return new InternalDownloadedDocument(bytes, fileName, contentType);
    }

    public InternalVaultBackupResponse exportBackup(Long ownerId) {
        List<VaultItem> passwords = vaultRepository.findByUserIdOrderByUpdatedAtDesc(ownerId);
        List<CreditCardEntity> cards = cardRepository.findByUserIdOrderByCreatedAtDesc(ownerId);
        List<DocumentVault> documents = documentRepository.findByUserIdOrderByCreatedAtDesc(ownerId);

        return new InternalVaultBackupResponse(
                passwords.stream().map(this::backupPassword).toList(),
                cards.stream().map(this::backupCard).toList(),
                documents.stream().map(this::backupDocument).toList(),
                passwords.size(),
                cards.size(),
                documents.size(),
                passwords.size() + cards.size() + documents.size()
        );
    }

    @Transactional
    public InternalVaultRestoreResponse restoreBackup(
            Long ownerId,
            InternalVaultRestoreRequest request
    ) {
        if (request == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Backup restore request is required.");
        }

        if (request.replaceExisting()) {
            vaultRepository.deleteAll(vaultRepository.findByUserIdOrderByUpdatedAtDesc(ownerId));
            cardRepository.deleteAll(cardRepository.findByUserIdOrderByCreatedAtDesc(ownerId));
            documentRepository.deleteAll(documentRepository.findByUserIdOrderByCreatedAtDesc(ownerId));
        }

        int passwords = restorePasswords(ownerId, request.passwords());
        int cards = restoreCards(ownerId, request.cards());
        int documents = restoreDocuments(ownerId, request.documents());

        return new InternalVaultRestoreResponse(
                request.replaceExisting(),
                passwords,
                cards,
                documents,
                passwords + cards + documents
        );
    }

    @Transactional
    public InternalVaultDeleteResponse deleteAllUserData(Long ownerId) {
        List<VaultItem> passwords = vaultRepository.findByUserIdOrderByUpdatedAtDesc(ownerId);
        List<CreditCardEntity> cards = cardRepository.findByUserIdOrderByCreatedAtDesc(ownerId);
        List<DocumentVault> documents = documentRepository.findByUserIdOrderByCreatedAtDesc(ownerId);
        List<SecureNote> notes = noteRepository.findByUserIdOrderByPinnedDescUpdatedAtDesc(ownerId);

        vaultRepository.deleteAll(passwords);
        cardRepository.deleteAll(cards);

        /*
         * Delete documents through DocumentService instead of deleting only the
         * database rows. This also removes encrypted Backblaze B2 objects.
         */
        for (DocumentVault document : documents) {
            documentService.deleteDocument(ownerId, document.getId());
        }

        noteRepository.deleteAll(notes);

        int total = passwords.size() + cards.size() + documents.size() + notes.size();
        return new InternalVaultDeleteResponse(
                passwords.size(),
                cards.size(),
                documents.size(),
                notes.size(),
                total
        );
    }

    public List<InternalPasswordRiskResponse> passwordRisks(
            Collection<Long> ownerIds
    ) {
        if (ownerIds == null || ownerIds.isEmpty()) return List.of();

        List<VaultItem> items = new ArrayList<>();
        for (Long ownerId : ownerIds.stream().filter(Objects::nonNull).distinct().toList()) {
            items.addAll(vaultRepository.findByUserIdOrderByUpdatedAtDesc(ownerId));
        }

        Map<Long, String> passwordByItem = new HashMap<>();
        Map<String, Integer> usage = new HashMap<>();

        for (VaultItem item : items) {
            String password = safeDecrypt(item.getEncryptedPassword());
            passwordByItem.put(item.getId(), password);
            String normalized = normalizePassword(password);
            if (!normalized.isBlank()) {
                usage.merge(normalized, 1, Integer::sum);
            }
        }

        return items.stream()
                .map(item -> risk(
                        item,
                        passwordByItem.getOrDefault(item.getId(), ""),
                        usage
                ))
                .filter(risk -> !risk.riskTypes().isEmpty())
                .toList();
    }

    private InternalPasswordRiskResponse risk(
            VaultItem item,
            String password,
            Map<String, Integer> usage
    ) {
        String normalized = normalizePassword(password);
        int strengthScore = strengthScore(password);
        String strengthLabel = strengthLabel(strengthScore);
        int reusedCount = normalized.isBlank() ? 0 : usage.getOrDefault(normalized, 0);
        boolean reused = reusedCount > 1;
        boolean old = isOld(item);

        List<String> types = new ArrayList<>();
        if ("WEAK".equals(strengthLabel)) types.add("WEAK");
        else if ("MEDIUM".equals(strengthLabel)) types.add("MEDIUM");
        if (reused) types.add("REUSED");
        if (old) types.add("OLD");

        return new InternalPasswordRiskResponse(
                item.getId(),
                item.getUserId(),
                safe(item.getTitle()),
                safe(item.getUsernameValue()),
                safe(item.getWebsite()),
                strengthScore,
                strengthLabel,
                old,
                reused,
                reusedCount,
                types
        );
    }

    private InternalVaultItemResponse password(VaultItem item, boolean detail) {
        return new InternalVaultItemResponse(
                item.getId(), item.getUserId(), "PASSWORD",
                safe(item.getTitle()), safe(item.getUsernameValue()),
                detail ? safeDecrypt(item.getEncryptedPassword()) : "",
                safe(item.getWebsite()),
                detail ? safeDecrypt(item.getNotes()) : "",
                null, null, null, null, null,
                null, null, null, null,
                null, null, null,
                item.getCreatedAt(), item.getUpdatedAt()
        );
    }

    private InternalVaultItemResponse card(CreditCardEntity card, boolean detail) {
        return new InternalVaultItemResponse(
                card.getId(), card.getUserId(), "CARD",
                safe(card.getCardName()), null, null, null, null,
                safe(card.getCardName()),
                detail ? safeDecrypt(card.getEncryptedCardNumber()) : "",
                detail ? safeDecrypt(card.getEncryptedExpiryDate()) : "",
                detail ? safeDecrypt(card.getEncryptedCvv()) : "",
                detail ? safeDecrypt(card.getEncryptedCardholderName()) : "",
                null, null, null, null,
                null, null, null,
                card.getCreatedAt(), null
        );
    }

    private InternalVaultItemResponse document(
            DocumentVault document,
            boolean detail
    ) {
        DocumentResponse response = detail
                ? documentService.getDocument(document.getUserId(), document.getId())
                : null;

        return new InternalVaultItemResponse(
                document.getId(), document.getUserId(), "DOCUMENT",
                safe(document.getDocumentName()), null, null, null, null,
                null, null, null, null, null,
                safe(document.getDocumentName()),
                safe(document.getDocumentType()),
                document.getSizeBytes(),
                detail && response != null ? safe(response.encryptedNotes()) : "",
                null, null, null,
                document.getCreatedAt(), document.getCreatedAt()
        );
    }

    private InternalVaultItemResponse note(SecureNote note, boolean detail) {
        return new InternalVaultItemResponse(
                note.getId(), note.getUserId(), "NOTE",
                safe(note.getTitle()), null, null, null, null,
                null, null, null, null, null,
                null, null, null, null,
                safe(note.getCategory()),
                detail ? safeDecrypt(note.getEncryptedContent()) : "",
                note.isPinned(),
                note.getCreatedAt(), note.getUpdatedAt()
        );
    }

    private VaultItem requireOwner(VaultItem item, Long ownerId) {
        if (!Objects.equals(item.getUserId(), ownerId)) throw forbidden();
        return item;
    }

    private CreditCardEntity requireOwner(CreditCardEntity item, Long ownerId) {
        if (!Objects.equals(item.getUserId(), ownerId)) throw forbidden();
        return item;
    }

    private DocumentVault requireOwner(DocumentVault item, Long ownerId) {
        if (!Objects.equals(item.getUserId(), ownerId)) throw forbidden();
        return item;
    }

    private SecureNote requireOwner(SecureNote item, Long ownerId) {
        if (!Objects.equals(item.getUserId(), ownerId)) throw forbidden();
        return item;
    }

    private InternalBackupPasswordItem backupPassword(VaultItem item) {
        return new InternalBackupPasswordItem(
                item.getId(),
                safe(item.getTitle()),
                safe(item.getUsernameValue()),
                safe(item.getEncryptedPassword()),
                safe(item.getWebsite()),
                safe(item.getNotes()),
                item.getCreatedAt(),
                item.getUpdatedAt()
        );
    }

    private InternalBackupCardItem backupCard(CreditCardEntity card) {
        return new InternalBackupCardItem(
                card.getId(),
                safe(card.getCardName()),
                safe(card.getEncryptedCardNumber()),
                safe(card.getEncryptedExpiryDate()),
                safe(card.getEncryptedCvv()),
                safe(card.getEncryptedCardholderName()),
                card.getCreatedAt()
        );
    }

    private InternalBackupDocumentItem backupDocument(DocumentVault document) {
        return new InternalBackupDocumentItem(
                document.getId(),
                safe(document.getDocumentName()),
                safe(document.getDocumentType()),
                safe(document.getEncryptedFileUrl()),
                safe(document.getEncryptedNotes()),
                safe(document.getStorageProvider()),
                safe(document.getStorageKey()),
                document.getSizeBytes(),
                document.getCreatedAt()
        );
    }

    private int restorePasswords(Long ownerId, List<InternalBackupPasswordItem> items) {
        if (items == null || items.isEmpty()) return 0;
        int restored = 0;
        for (InternalBackupPasswordItem item : items) {
            if (item == null || isBlank(item.title()) || isBlank(item.encryptedPassword())) continue;
            vaultRepository.save(VaultItem.builder()
                    .userId(ownerId)
                    .title(item.title())
                    .usernameValue(safe(item.usernameValue()))
                    .encryptedPassword(item.encryptedPassword())
                    .website(safe(item.website()))
                    .notes(safe(item.notes()))
                    .createdAt(item.createdAt() == null ? LocalDateTime.now() : item.createdAt())
                    .updatedAt(item.updatedAt() == null
                            ? (item.createdAt() == null ? LocalDateTime.now() : item.createdAt())
                            : item.updatedAt())
                    .build());
            restored++;
        }
        return restored;
    }

    private int restoreCards(Long ownerId, List<InternalBackupCardItem> items) {
        if (items == null || items.isEmpty()) return 0;
        int restored = 0;
        for (InternalBackupCardItem item : items) {
            if (item == null
                    || isBlank(item.cardName())
                    || isBlank(item.encryptedCardNumber())
                    || isBlank(item.encryptedExpiryDate())
                    || isBlank(item.encryptedCvv())) continue;
            cardRepository.save(CreditCardEntity.builder()
                    .userId(ownerId)
                    .cardName(item.cardName())
                    .encryptedCardNumber(item.encryptedCardNumber())
                    .encryptedExpiryDate(item.encryptedExpiryDate())
                    .encryptedCvv(item.encryptedCvv())
                    .encryptedCardholderName(safe(item.encryptedCardholderName()))
                    .createdAt(item.createdAt() == null ? LocalDateTime.now() : item.createdAt())
                    .build());
            restored++;
        }
        return restored;
    }

    private int restoreDocuments(Long ownerId, List<InternalBackupDocumentItem> items) {
        if (items == null || items.isEmpty()) return 0;
        int restored = 0;
        for (InternalBackupDocumentItem item : items) {
            boolean hasInlineData = item != null && !isBlank(item.encryptedFileUrl());
            boolean hasObjectStorageData = item != null && !isBlank(item.storageKey());
            if (item == null || isBlank(item.documentName()) || (!hasInlineData && !hasObjectStorageData)) {
                continue;
            }
            documentRepository.save(DocumentVault.builder()
                    .userId(ownerId)
                    .documentName(item.documentName())
                    .documentType(safe(item.documentType()))
                    .encryptedFileUrl(safe(item.encryptedFileUrl()))
                    .encryptedNotes(safe(item.encryptedNotes()))
                    .storageProvider(safe(item.storageProvider()))
                    .storageKey(safe(item.storageKey()))
                    .sizeBytes(item.sizeBytes())
                    .createdAt(item.createdAt() == null ? LocalDateTime.now() : item.createdAt())
                    .build());
            restored++;
        }
        return restored;
    }

    private boolean isBlank(String value) {
        return value == null || value.isBlank();
    }

    private String normalizeType(String value) {
        String type = value == null ? "" : value.trim().toUpperCase();
        return switch (type) {
            case "PASSWORD", "PASSWORDS" -> "PASSWORD";
            case "CARD", "CARDS" -> "CARD";
            case "DOCUMENT", "DOCUMENTS" -> "DOCUMENT";
            case "NOTE", "NOTES" -> "NOTE";
            default -> throw badType();
        };
    }

    private String normalizePassword(String value) {
        return value == null ? "" : value.trim();
    }

    private boolean isOld(VaultItem item) {
        LocalDateTime changedAt =
                item.getUpdatedAt() == null ? item.getCreatedAt() : item.getUpdatedAt();
        return changedAt != null
                && ChronoUnit.DAYS.between(changedAt, LocalDateTime.now()) >= PASSWORD_OLD_DAYS;
    }

    private int strengthScore(String password) {
        if (password == null || password.isBlank()) return 0;

        int score = 0;
        if (password.length() >= 8) score += 15;
        if (password.length() >= 12) score += 20;
        if (password.length() >= 16) score += 10;
        if (password.matches(".*[a-z].*")) score += 10;
        if (password.matches(".*[A-Z].*")) score += 15;
        if (password.matches(".*[0-9].*")) score += 15;
        if (password.matches(".*[^A-Za-z0-9].*")) score += 15;

        String lower = password.toLowerCase();
        if (List.of("password", "qwerty", "admin", "welcome", "guardian", "123456")
                .stream().anyMatch(lower::contains)) score -= 25;
        if (password.matches(".*(.)\\1{2,}.*")) score -= 10;
        if (password.matches("^(123|234|345|456|567|678|789|890).*")) score -= 10;

        return Math.max(0, Math.min(100, score));
    }

    private String strengthLabel(int score) {
        if (score < 45) return "WEAK";
        if (score < 75) return "MEDIUM";
        return "STRONG";
    }

    private String safeDecrypt(String value) {
        String decrypted = cryptoService.decryptForResponse(value);
        return decrypted == null ? "" : decrypted;
    }

    private String safe(String value) {
        return value == null ? "" : value;
    }

    private ResponseStatusException notFound(String item) {
        return new ResponseStatusException(HttpStatus.NOT_FOUND, item + " not found.");
    }

    private ResponseStatusException forbidden() {
        return new ResponseStatusException(
                HttpStatus.FORBIDDEN,
                "This item does not belong to the requested vault owner."
        );
    }

    private ResponseStatusException badType() {
        return new ResponseStatusException(
                HttpStatus.BAD_REQUEST,
                "Unknown vault item type."
        );
    }
}
