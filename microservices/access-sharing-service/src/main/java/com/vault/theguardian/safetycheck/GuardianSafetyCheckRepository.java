package com.vault.theguardian.safetycheck;

import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.Instant;
import java.util.List;
import java.util.Optional;

public interface GuardianSafetyCheckRepository extends JpaRepository<GuardianSafetyCheck, Long> {
    Optional<GuardianSafetyCheck> findByOwnerId(Long ownerId);

    boolean existsByContact_IdAndStatusNot(
            Long contactId,
            SafetyCheckStatus status
    );

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select safetyCheck from GuardianSafetyCheck safetyCheck where safetyCheck.ownerId = :ownerId")
    Optional<GuardianSafetyCheck> findByOwnerIdForUpdate(@Param("ownerId") Long ownerId);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select safetyCheck from GuardianSafetyCheck safetyCheck where safetyCheck.id = :id")
    Optional<GuardianSafetyCheck> findByIdForUpdate(@Param("id") Long id);

    List<GuardianSafetyCheck> findByStatusAndNextCheckInAtLessThanEqualOrderByNextCheckInAtAsc(
            SafetyCheckStatus status,
            Instant now
    );

    List<GuardianSafetyCheck> findByStatusAndGraceStartedAtLessThanEqualOrderByGraceStartedAtAsc(
            SafetyCheckStatus status,
            Instant latestGraceStart
    );
}
