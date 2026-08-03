package com.vault.theguardian.backuprecovery.recoverycircle;

import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.Optional;

public interface RecoveryCircleRepository extends JpaRepository<RecoveryCircle, Long> {
    Optional<RecoveryCircle> findByOwnerId(Long ownerId);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select circle from RecoveryCircle circle where circle.ownerId = :ownerId")
    Optional<RecoveryCircle> findByOwnerIdForUpdate(@Param("ownerId") Long ownerId);
}
