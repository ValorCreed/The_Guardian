package com.vault.theguardian.recovery;

import com.vault.theguardian.user.User;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface RecoveryKitRepository extends JpaRepository<RecoveryKit, Long> {
    Optional<RecoveryKit> findFirstByUserAndActiveTrueOrderByCreatedAtDesc(User user);

    Optional<RecoveryKit> findByRecoveryIdAndActiveTrue(String recoveryId);

    List<RecoveryKit> findByUserAndActiveTrue(User user);
}
