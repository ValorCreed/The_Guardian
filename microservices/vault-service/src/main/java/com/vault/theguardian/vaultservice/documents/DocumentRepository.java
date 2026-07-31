package com.vault.theguardian.vaultservice.documents;

import org.springframework.data.jpa.repository.JpaRepository;
import java.util.List;

public interface DocumentRepository extends JpaRepository<DocumentVault, Long> {
    List<DocumentVault> findByUserIdOrderByCreatedAtDesc(Long userId);
}
