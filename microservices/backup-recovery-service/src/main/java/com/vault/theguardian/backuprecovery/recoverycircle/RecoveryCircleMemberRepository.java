package com.vault.theguardian.backuprecovery.recoverycircle;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface RecoveryCircleMemberRepository extends JpaRepository<RecoveryCircleMember, Long> {
    List<RecoveryCircleMember> findByCircleIdOrderByCreatedAtAsc(Long circleId);
    List<RecoveryCircleMember> findByMemberUserIdOrderByCreatedAtDesc(Long memberUserId);
    Optional<RecoveryCircleMember> findByCircleIdAndMemberUserId(Long circleId, Long memberUserId);
    long countByCircleId(Long circleId);
    void deleteByCircleId(Long circleId);
}
