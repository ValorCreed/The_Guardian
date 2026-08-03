package com.vault.theguardian.vaultservice.documents;

import org.springframework.data.jpa.repository.JpaRepository;
import java.util.List;
import java.util.Optional;

public interface DocumentRepository extends JpaRepository<DocumentVault, Long> {
    List<DocumentVault> findByUserIdAndDecoyOrderByCreatedAtDesc(Long userId, boolean decoy);
    Optional<DocumentVault> findByIdAndUserIdAndDecoy(Long id, Long userId, boolean decoy);
}
