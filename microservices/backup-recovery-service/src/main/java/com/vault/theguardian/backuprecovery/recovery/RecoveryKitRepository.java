package com.vault.theguardian.backuprecovery.recovery;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface RecoveryKitRepository extends JpaRepository<RecoveryKit, Long> {
    Optional<RecoveryKit> findFirstByUserIdAndActiveTrueOrderByCreatedAtDesc(Long userId);
    Optional<RecoveryKit> findByRecoveryIdAndActiveTrue(String recoveryId);
    List<RecoveryKit> findByUserIdAndActiveTrue(Long userId);
    void deleteByUserId(Long userId);
}
