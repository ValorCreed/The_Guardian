package com.vault.theguardian.continuitydrill;

import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.Instant;
import java.util.List;
import java.util.Optional;

public interface ContinuityDrillParticipantRepository extends JpaRepository<ContinuityDrillParticipant, Long> {
    List<ContinuityDrillParticipant> findByDrillIdOrderByParticipantNameSnapshotAsc(Long drillId);

    List<ContinuityDrillParticipant> findTop50ByParticipantUserIdOrderByIdDesc(Long participantUserId);

    long countByDrillId(Long drillId);

    long countByDrillIdAndStatus(Long drillId, ContinuityParticipantStatus status);

    @Query("select distinct participant.drill.id from ContinuityDrillParticipant participant " +
            "where participant.participantUserId = :userId " +
            "and participant.drill.status = :status " +
            "and participant.drill.expiresAt <= :now")
    List<Long> findExpiredDrillIdsForParticipant(
            @Param("userId") Long userId,
            @Param("status") ContinuityDrillStatus status,
            @Param("now") Instant now
    );

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select participant from ContinuityDrillParticipant participant " +
            "where participant.drill.publicId = :publicId and participant.participantUserId = :userId")
    Optional<ContinuityDrillParticipant> findForAcknowledgement(
            @Param("publicId") String publicId,
            @Param("userId") Long userId
    );
}
