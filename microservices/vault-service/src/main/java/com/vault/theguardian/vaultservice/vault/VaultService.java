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

    private final VaultItemRepository vaultItemRepository;
    private final SubscriptionClient subscriptionClient;
    private final NotificationClient notificationClient;
    private final VaultCryptoService vaultCryptoService;

    public VaultService(
            VaultItemRepository vaultItemRepository,
            SubscriptionClient subscriptionClient,
            NotificationClient notificationClient,
            VaultCryptoService vaultCryptoService
    ) {
        this.vaultItemRepository = vaultItemRepository;
        this.subscriptionClient = subscriptionClient;
        this.notificationClient = notificationClient;
        this.vaultCryptoService = vaultCryptoService;
    }

    public VaultResponse createVaultItem(Long userId, VaultRequest request) {
        long count = vaultItemRepository.countByUserId(userId);
        if (!subscriptionClient.canCreateVaultItem(userId, count)) {
            throw new PlanLimitException("PASSWORD", FREE_PASSWORD_LIMIT,
                    "Your Free plan can save up to " + FREE_PASSWORD_LIMIT
                            + " passwords. Upgrade to Premium or Family for unlimited password storage.");
        }

        LocalDateTime now = LocalDateTime.now();
        VaultItem item = VaultItem.builder()
                .userId(userId)
                .title(request.title().trim())
                .usernameValue(request.usernameValue())
                .encryptedPassword(vaultCryptoService.encryptNullable(request.encryptedPassword()))
                .website(request.website())
                .notes(vaultCryptoService.encryptNullable(request.notes()))
                .createdAt(now)
                .updatedAt(now)
                .build();

        VaultItem saved = vaultItemRepository.save(item);
        notificationClient.notifyPasswordAdded(userId, saved.getTitle());
        return toResponse(saved);
    }

    public List<VaultResponse> getMyVaultItems(Long userId) {
        return vaultItemRepository.findByUserIdOrderByUpdatedAtDesc(userId)
                .stream().map(this::toResponse).toList();
    }

    public VaultResponse getVaultItem(Long userId, Long id) {
        return toResponse(getOwnedVaultItem(userId, id));
    }

    public VaultResponse updateVaultItem(Long userId, Long id, VaultRequest request) {
        VaultItem item = getOwnedVaultItem(userId, id);
        item.setTitle(request.title().trim());
        item.setUsernameValue(request.usernameValue());
        item.setEncryptedPassword(vaultCryptoService.encryptNullable(request.encryptedPassword()));
        item.setWebsite(request.website());
        item.setNotes(vaultCryptoService.encryptNullable(request.notes()));
        item.setUpdatedAt(LocalDateTime.now());
        return toResponse(vaultItemRepository.save(item));
    }

    public void deleteVaultItem(Long userId, Long id) {
        vaultItemRepository.delete(getOwnedVaultItem(userId, id));
    }

    private VaultItem getOwnedVaultItem(Long userId, Long id) {
        VaultItem item = vaultItemRepository.findById(id)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Vault item not found."));
        if (!item.getUserId().equals(userId)) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "You cannot access this item.");
        }
        return item;
    }

    private VaultResponse toResponse(VaultItem item) {
        return new VaultResponse(
                item.getId(), item.getTitle(), item.getUsernameValue(),
                vaultCryptoService.decryptForResponse(item.getEncryptedPassword()),
                item.getWebsite(), vaultCryptoService.decryptForResponse(item.getNotes()),
                item.getCreatedAt(), item.getUpdatedAt()
        );
    }
}
