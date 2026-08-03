package com.vault.theguardian.vaultservice.notes;

import org.springframework.data.jpa.repository.JpaRepository;
import java.util.List;
import java.util.Optional;

public interface SecureNoteRepository extends JpaRepository<SecureNote, Long> {
    List<SecureNote> findByUserIdAndDecoyOrderByPinnedDescUpdatedAtDesc(Long userId, boolean decoy);
    Optional<SecureNote> findByIdAndUserIdAndDecoy(Long id, Long userId, boolean decoy);
    long countByUserIdAndDecoy(Long userId, boolean decoy);
}
