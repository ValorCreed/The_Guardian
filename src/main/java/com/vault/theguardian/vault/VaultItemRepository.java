package com.vault.theguardian.vault;

import com.vault.theguardian.user.User;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface VaultItemRepository extends JpaRepository<VaultItem, Long> {
    List<VaultItem> findByUser(User user);
    List<VaultItem> findByUserIn(List<User> users);
    long countByUser(User user);
}
