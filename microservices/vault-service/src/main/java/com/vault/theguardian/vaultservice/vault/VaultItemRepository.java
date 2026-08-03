package com.vault.theguardian.vaultservice.vault;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface VaultItemRepository extends JpaRepository<VaultItem, Long> {
    List<VaultItem> findByUserIdAndDecoyOrderByUpdatedAtDesc(Long userId, boolean decoy);
    Optional<VaultItem> findByIdAndUserIdAndDecoy(Long id, Long userId, boolean decoy);
    long countByUserIdAndDecoy(Long userId, boolean decoy);
}
