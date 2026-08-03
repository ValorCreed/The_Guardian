package com.vault.theguardian.backuprecovery.recoverycircle;

import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.Collection;
import java.util.List;
import java.util.Optional;

public interface RecoveryCircleRequestRepository extends JpaRepository<RecoveryCircleRequest, Long> {
    Optional<RecoveryCircleRequest> findByPublicId(String publicId);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select request from RecoveryCircleRequest request where request.publicId = :publicId")
    Optional<RecoveryCircleRequest> findByPublicIdForUpdate(@Param("publicId") String publicId);

    Optional<RecoveryCircleRequest> findFirstByCircleIdAndStatusInOrderByCreatedAtDesc(
            Long circleId,
            Collection<RecoveryCircleRequestStatus> statuses
    );

    List<RecoveryCircleRequest> findByOwnerIdOrderByCreatedAtDesc(Long ownerId);
}
