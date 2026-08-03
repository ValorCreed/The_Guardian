package com.vault.theguardian.vaultservice.vault;

import com.vault.theguardian.vaultservice.common.PlanLimitException;
import com.vault.theguardian.vaultservice.notification.NotificationClient;
import com.vault.theguardian.vaultservice.subscription.SubscriptionClient;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

import java.time.LocalDateTime;
import java.util.List;

@Service
public class VaultService {
    private static final long FREE_PASSWORD_LIMIT = 10;
    private final VaultItemRepository repository;
    private final SubscriptionClient subscriptionClient;
    private final NotificationClient notificationClient;
    private final VaultCryptoService crypto;

    public VaultService(VaultItemRepository repository, SubscriptionClient subscriptionClient,
                        NotificationClient notificationClient, VaultCryptoService crypto) {
        this.repository = repository;
        this.subscriptionClient = subscriptionClient;
        this.notificationClient = notificationClient;
        this.crypto = crypto;
    }

    public VaultResponse createVaultItem(Long userId, boolean decoy, VaultRequest request) {
        if (!decoy) {
            long count = repository.countByUserIdAndDecoy(userId, false);
            if (!subscriptionClient.canCreateVaultItem(userId, count)) {
                throw new PlanLimitException("PASSWORD", FREE_PASSWORD_LIMIT,
                        "Your Free plan can save up to " + FREE_PASSWORD_LIMIT
                                + " passwords. Upgrade to Premium or Family for unlimited password storage.");
            }
        }
        LocalDateTime now = LocalDateTime.now();
        VaultItem saved = repository.save(VaultItem.builder()
                .userId(userId).decoy(decoy).title(request.title().trim())
                .usernameValue(request.usernameValue())
                .encryptedPassword(crypto.encryptNullable(request.encryptedPassword(), decoy))
                .website(request.website()).notes(crypto.encryptNullable(request.notes(), decoy))
                .createdAt(now).updatedAt(now).build());
        if (!decoy) notificationClient.notifyPasswordAdded(userId, saved.getTitle());
        return toResponse(saved);
    }

    public List<VaultResponse> getMyVaultItems(Long userId, boolean decoy) {
        return repository.findByUserIdAndDecoyOrderByUpdatedAtDesc(userId, decoy)
                .stream().map(this::toResponse).toList();
    }
    public VaultResponse getVaultItem(Long userId, boolean decoy, Long id) {
        return toResponse(owned(userId, decoy, id));
    }
    public VaultResponse updateVaultItem(Long userId, boolean decoy, Long id, VaultRequest request) {
        VaultItem item = owned(userId, decoy, id);
        item.setTitle(request.title().trim()); item.setUsernameValue(request.usernameValue());
        item.setEncryptedPassword(crypto.encryptNullable(request.encryptedPassword(), decoy));
        item.setWebsite(request.website()); item.setNotes(crypto.encryptNullable(request.notes(), decoy));
        item.setUpdatedAt(LocalDateTime.now());
        return toResponse(repository.save(item));
    }
    public void deleteVaultItem(Long userId, boolean decoy, Long id) { repository.delete(owned(userId, decoy, id)); }

    private VaultItem owned(Long userId, boolean decoy, Long id) {
        return repository.findByIdAndUserIdAndDecoy(id, userId, decoy)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Vault item not found."));
    }
    private VaultResponse toResponse(VaultItem item) {
        return new VaultResponse(item.getId(), item.getTitle(), item.getUsernameValue(),
                crypto.decryptForResponse(item.getEncryptedPassword(), item.isDecoy()), item.getWebsite(),
                crypto.decryptForResponse(item.getNotes(), item.isDecoy()), item.getCreatedAt(), item.getUpdatedAt());
    }
}
