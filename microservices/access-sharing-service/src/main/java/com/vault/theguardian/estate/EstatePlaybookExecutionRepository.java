package com.vault.theguardian.estate;

import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;

import java.util.Collection;
import java.util.List;
import java.util.Optional;

public interface EstatePlaybookExecutionRepository extends JpaRepository<EstatePlaybookExecution, Long> {
    List<EstatePlaybookExecution> findByOwnerIdOrderByReleasedAtDesc(Long ownerId);
    List<EstatePlaybookExecution> findByRecipientUserIdOrderByReleasedAtDesc(Long recipientUserId);
    boolean existsByRecipientContact_Id(Long recipientContactId);
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    Optional<EstatePlaybookExecution> findByIdAndOwnerId(Long id, Long ownerId);
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    Optional<EstatePlaybookExecution> findByIdAndRecipientUserId(Long id, Long recipientUserId);

    boolean existsByPlaybook_IdAndSourceTypeAndSourceReferenceId(
            Long playbookId,
            EstateExecutionSource sourceType,
            Long sourceReferenceId
    );

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    Optional<EstatePlaybookExecution> findFirstByPlaybook_IdAndStatusInOrderByReleasedAtDesc(
            Long playbookId,
            Collection<EstateExecutionStatus> statuses
    );
}
