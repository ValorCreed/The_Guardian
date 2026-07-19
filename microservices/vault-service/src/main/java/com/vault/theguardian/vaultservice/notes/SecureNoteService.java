package com.vault.theguardian.vaultservice.notes;

import com.vault.theguardian.vaultservice.common.PlanLimitException;
import com.vault.theguardian.vaultservice.notification.NotificationClient;
import com.vault.theguardian.vaultservice.subscription.SubscriptionClient;
import com.vault.theguardian.vaultservice.vault.VaultCryptoService;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

import java.time.LocalDateTime;
import java.util.List;

@Service
public class SecureNoteService {
    private final SecureNoteRepository repository;
    private final SubscriptionClient subscriptionClient;
    private final NotificationClient notificationClient;
    private final VaultCryptoService cryptoService;

    public SecureNoteService(SecureNoteRepository repository,
                             SubscriptionClient subscriptionClient,
                             NotificationClient notificationClient,
                             VaultCryptoService cryptoService) {
        this.repository = repository;
        this.subscriptionClient = subscriptionClient;
        this.notificationClient = notificationClient;
        this.cryptoService = cryptoService;
    }

    public SecureNoteResponse create(Long userId, SecureNoteRequest request) {
        long count = repository.countByUserId(userId);
        if (!subscriptionClient.canCreateSecureNote(userId, count)) {
            long limit = subscriptionClient.getEntitlements(userId).maxSecureNotes();
            throw new PlanLimitException("SECURE_NOTE", limit,
                    "Free note limit reached. Upgrade to Premium or Family for unlimited secure notes.");
        }

        LocalDateTime now = LocalDateTime.now();
        SecureNote note = SecureNote.builder()
                .userId(userId)
                .title(cleanTitle(request.title()))
                .category(cleanCategory(request.category()))
                .encryptedContent(cryptoService.encryptNullable(request.encryptedContent()))
                .pinned(Boolean.TRUE.equals(request.pinned()))
                .createdAt(now).updatedAt(now).build();
        SecureNote saved = repository.save(note);
        notificationClient.notifySecureNoteAdded(userId, saved.getTitle());
        return toResponse(saved);
    }

    public List<SecureNoteResponse> list(Long userId) {
        return repository.findByUserIdOrderByPinnedDescUpdatedAtDesc(userId)
                .stream().map(this::toResponse).toList();
    }

    public SecureNoteResponse get(Long userId, Long id) { return toResponse(owned(userId, id)); }

    public SecureNoteResponse update(Long userId, Long id, SecureNoteRequest request) {
        SecureNote note = owned(userId, id);
        note.setTitle(cleanTitle(request.title()));
        note.setCategory(cleanCategory(request.category()));
        note.setEncryptedContent(cryptoService.encryptNullable(request.encryptedContent()));
        note.setPinned(Boolean.TRUE.equals(request.pinned()));
        note.setUpdatedAt(LocalDateTime.now());
        SecureNote saved = repository.save(note);
        notificationClient.notifySecureNoteUpdated(userId, saved.getTitle());
        return toResponse(saved);
    }

    public void delete(Long userId, Long id) {
        SecureNote note = owned(userId, id);
        String title = note.getTitle();
        repository.delete(note);
        notificationClient.notifySecureNoteDeleted(userId, title);
    }

    private SecureNote owned(Long userId, Long id) {
        SecureNote note = repository.findById(id)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Secure note not found."));
        if (!note.getUserId().equals(userId)) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "You cannot access this secure note.");
        }
        return note;
    }

    private String cleanTitle(String value) {
        return value == null || value.isBlank() ? "Untitled note" : value.trim();
    }
    private String cleanCategory(String value) {
        return value == null || value.isBlank() ? "General" : value.trim();
    }
    private SecureNoteResponse toResponse(SecureNote note) {
        return new SecureNoteResponse(note.getId(), note.getTitle(), note.getCategory(),
                cryptoService.decryptForResponse(note.getEncryptedContent()), note.isPinned(),
                note.getCreatedAt(), note.getUpdatedAt());
    }
}
