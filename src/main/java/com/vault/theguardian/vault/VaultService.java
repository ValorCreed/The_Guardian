package com.vault.theguardian.vault;

import com.vault.theguardian.subscription.SubscriptionService;
import com.vault.theguardian.user.User;
import org.springframework.stereotype.Service;

import java.time.LocalDateTime;
import java.util.List;

@Service
public class VaultService {
    private final VaultItemRepository vaultItemRepository;
    private final SubscriptionService subscriptionService;

    public VaultService(VaultItemRepository vaultItemRepository,
                        SubscriptionService subscriptionService) {
        this.vaultItemRepository = vaultItemRepository;
        this.subscriptionService = subscriptionService;
    }

    public VaultResponse createVaultItem(User user, VaultRequest request) {
        // Faster than findByUser(user).size(), but requires countByUser(User user) in VaultItemRepository.
        long count = vaultItemRepository.countByUser(user);

        if (!subscriptionService.canCreateVaultItem(user, count)) {
            throw new RuntimeException("Free plan limit reached. Upgrade to Premium.");
        }

        VaultItem item = VaultItem.builder()
                .title(request.title())
                .usernameValue(request.usernameValue())
                .encryptedPassword(request.encryptedPassword())
                .website(request.website())
                .notes(request.notes())
                .createdAt(LocalDateTime.now())
                .user(user)
                .build();

        VaultItem saved = vaultItemRepository.save(item);
        return toResponse(saved);
    }

    public List<VaultResponse> getMyVaultItems(User user) {
        return vaultItemRepository.findByUser(user)
                .stream()
                .map(this::toResponse)
                .toList();
    }

    public VaultResponse getVaultItem(User user, Long id) {
        VaultItem item = getOwnedVaultItem(user, id);
        return toResponse(item);
    }

    public VaultResponse updateVaultItem(User user, Long id, VaultRequest request) {
        VaultItem item = getOwnedVaultItem(user, id);

        item.setTitle(request.title());
        item.setUsernameValue(request.usernameValue());
        item.setEncryptedPassword(request.encryptedPassword());
        item.setWebsite(request.website());
        item.setNotes(request.notes());

        VaultItem saved = vaultItemRepository.save(item);
        return toResponse(saved);
    }

    public void deleteVaultItem(User user, Long id) {
        VaultItem item = getOwnedVaultItem(user, id);
        vaultItemRepository.delete(item);
    }

    private VaultItem getOwnedVaultItem(User user, Long id) {
        VaultItem item = vaultItemRepository.findById(id)
                .orElseThrow(() -> new RuntimeException("Vault item not found"));

        if (!item.getUser().getId().equals(user.getId())) {
            throw new RuntimeException("You cannot access this item");
        }

        return item;
    }

    private VaultResponse toResponse(VaultItem item) {
        return new VaultResponse(
                item.getId(),
                item.getTitle(),
                item.getUsernameValue(),
                item.getEncryptedPassword(),
                item.getWebsite(),
                item.getNotes()
        );
    }
}
