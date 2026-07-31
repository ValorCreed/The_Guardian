package com.vault.theguardian.vaultservice.vault;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface VaultItemRepository extends JpaRepository<VaultItem, Long> {
    List<VaultItem> findByUserIdOrderByUpdatedAtDesc(Long userId);
    long countByUserId(Long userId);
}
