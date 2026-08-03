package com.vault.theguardian.continuitydrill;

import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.Instant;
import java.util.List;
import java.util.Optional;

public interface ContinuityDrillRepository extends JpaRepository<ContinuityDrill, Long> {
    List<ContinuityDrill> findTop5ByOwnerIdOrderByStartedAtDesc(Long ownerId);

    Optional<ContinuityDrill> findFirstByOwnerIdAndStatusOrderByStartedAtDesc(
            Long ownerId,
            ContinuityDrillStatus status
    );

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select drill from ContinuityDrill drill where drill.id = :id")
    Optional<ContinuityDrill> findByIdForUpdate(@Param("id") Long id);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select drill from ContinuityDrill drill where drill.id = :id and drill.ownerId = :ownerId")
    Optional<ContinuityDrill> findByIdAndOwnerIdForUpdate(
            @Param("id") Long id,
            @Param("ownerId") Long ownerId
    );

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select drill from ContinuityDrill drill where drill.publicId = :publicId")
    Optional<ContinuityDrill> findByPublicIdForUpdate(@Param("publicId") String publicId);

    List<ContinuityDrill> findByStatusAndExpiresAtLessThanEqualOrderByExpiresAtAsc(
            ContinuityDrillStatus status,
            Instant now
    );
}
