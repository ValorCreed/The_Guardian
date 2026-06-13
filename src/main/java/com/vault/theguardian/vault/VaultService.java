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

    public VaultResponse createVaultItem(User user, VaultRequest request){
        long count = vaultItemRepository.findByUser(user).size();

        if(!subscriptionService.canCreateVaultItem(user,count)){
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

    public List<VaultResponse> getMyVaultItems(User user){
        return vaultItemRepository.findByUser(user)
                .stream()
                .map(this::toResponse)
                .toList();
    }

    public void deleteVaultItem(User user, Long id){
        VaultItem item = vaultItemRepository.findById(id)
                .orElseThrow(()->new RuntimeException("Vault Item not Found"));

        if (!item.getUser().getId().equals(user.getId())){
            throw new RuntimeException("You cannot delete this item");
        }

        vaultItemRepository.delete(item);
    }

    private VaultResponse toResponse(VaultItem item){
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
