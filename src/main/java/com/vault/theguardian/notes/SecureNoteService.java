package com.vault.theguardian.notes;

import com.vault.theguardian.integration.notification.NotificationClient;
import com.vault.theguardian.integration.subscription.SubscriptionClient;
import com.vault.theguardian.user.User;
import com.vault.theguardian.vault.VaultCryptoService;
import org.springframework.stereotype.Service;

import java.time.LocalDateTime;
import java.util.List;

@Service
public class SecureNoteService {
    private final SecureNoteRepository secureNoteRepository;
    private final SubscriptionClient subscriptionService;
    private final NotificationClient notificationClient;
    private final VaultCryptoService vaultCryptoService;

    public SecureNoteService(SecureNoteRepository secureNoteRepository,
                             SubscriptionClient subscriptionService,
                             NotificationClient notificationClient,
                             VaultCryptoService vaultCryptoService) {
        this.secureNoteRepository = secureNoteRepository;
        this.subscriptionService = subscriptionService;
        this.notificationClient = notificationClient;
        this.vaultCryptoService = vaultCryptoService;
    }

    public SecureNoteResponse createNote(User user, SecureNoteRequest request) {
        long currentNoteCount = secureNoteRepository.countByUser(user);

        if (!subscriptionService.canCreateSecureNote(user, currentNoteCount)) {
            throw new RuntimeException("Free note limit reached. Upgrade to Premium or Family for unlimited secure notes.");
        }

        LocalDateTime now = LocalDateTime.now();

        SecureNote note = SecureNote.builder()
                .title(cleanTitle(request.title()))
                .category(cleanCategory(request.category()))
                .encryptedContent(vaultCryptoService.encryptNullable(request.encryptedContent()))
                .pinned(Boolean.TRUE.equals(request.pinned()))
                .createdAt(now)
                .updatedAt(now)
                .user(user)
                .build();

        SecureNote saved = secureNoteRepository.save(note);
        notificationClient.notifySecureNoteAdded(user, saved.getTitle());
        return toResponse(saved);
    }

    public List<SecureNoteResponse> getMyNotes(User user) {
        return secureNoteRepository.findByUserOrderByPinnedDescUpdatedAtDesc(user)
                .stream()
                .map(this::toResponse)
                .toList();
    }

    public SecureNoteResponse getNote(User user, Long id) {
        return toResponse(getOwnedNote(user, id));
    }

    public SecureNoteResponse updateNote(User user, Long id, SecureNoteRequest request) {
        SecureNote note = getOwnedNote(user, id);

        note.setTitle(cleanTitle(request.title()));
        note.setCategory(cleanCategory(request.category()));
        note.setEncryptedContent(vaultCryptoService.encryptNullable(request.encryptedContent()));
        note.setPinned(Boolean.TRUE.equals(request.pinned()));
        note.setUpdatedAt(LocalDateTime.now());

        SecureNote saved = secureNoteRepository.save(note);
        notificationClient.notifySecureNoteUpdated(user, saved.getTitle());
        return toResponse(saved);
    }

    public void deleteNote(User user, Long id) {
        SecureNote note = getOwnedNote(user, id);
        String title = note.getTitle();
        secureNoteRepository.delete(note);
        notificationClient.notifySecureNoteDeleted(user, title);
    }

    private SecureNote getOwnedNote(User user, Long id) {
        SecureNote note = secureNoteRepository.findById(id)
                .orElseThrow(() -> new RuntimeException("Secure note not found"));

        if (!note.getUser().getId().equals(user.getId())) {
            throw new RuntimeException("You cannot access this secure note");
        }

        return note;
    }

    private String cleanTitle(String title) {
        if (title == null || title.trim().isBlank()) {
            return "Untitled note";
        }
        return title.trim();
    }

    private String cleanCategory(String category) {
        if (category == null || category.trim().isBlank()) {
            return "General";
        }

        return category.trim();
    }

    private SecureNoteResponse toResponse(SecureNote note) {
        return new SecureNoteResponse(
                note.getId(),
                note.getTitle(),
                note.getCategory(),
                vaultCryptoService.decryptForResponse(note.getEncryptedContent()),
                note.isPinned(),
                note.getCreatedAt(),
                note.getUpdatedAt()
        );
    }
}
