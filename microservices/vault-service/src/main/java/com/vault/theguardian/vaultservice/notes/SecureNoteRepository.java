package com.vault.theguardian.vaultservice.notes;

import org.springframework.data.jpa.repository.JpaRepository;
import java.util.List;

public interface SecureNoteRepository extends JpaRepository<SecureNote, Long> {
    List<SecureNote> findByUserIdOrderByPinnedDescUpdatedAtDesc(Long userId);
    long countByUserId(Long userId);
}
