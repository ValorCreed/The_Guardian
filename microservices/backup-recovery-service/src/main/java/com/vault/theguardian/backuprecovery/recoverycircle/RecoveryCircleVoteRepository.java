package com.vault.theguardian.backuprecovery.recoverycircle;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface RecoveryCircleVoteRepository extends JpaRepository<RecoveryCircleVote, Long> {
    List<RecoveryCircleVote> findByRequestIdOrderByDecidedAtAsc(Long requestId);
    Optional<RecoveryCircleVote> findByRequestIdAndMemberUserId(Long requestId, Long memberUserId);
    long countByRequestIdAndDecision(Long requestId, RecoveryCircleVoteDecision decision);
}
