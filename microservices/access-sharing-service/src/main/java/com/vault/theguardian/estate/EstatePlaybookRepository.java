package com.vault.theguardian.estate;

import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;

import java.util.Collection;
import java.util.List;
import java.util.Optional;

public interface EstatePlaybookRepository extends JpaRepository<EstatePlaybook, Long> {
    List<EstatePlaybook> findByOwnerIdAndStatusOrderByCreatedAtDesc(
            Long ownerId,
            EstatePlaybookStatus status
    );

    List<EstatePlaybook> findByOwnerIdAndStatusNotOrderByCreatedAtDesc(
            Long ownerId,
            EstatePlaybookStatus status
    );

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    Optional<EstatePlaybook> findByIdAndOwnerId(Long id, Long ownerId);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    List<EstatePlaybook> findByOwnerIdAndTriggerTypeAndRecipientContact_IdAndStatus(
            Long ownerId,
            EstateTriggerType triggerType,
            Long recipientContactId,
            EstatePlaybookStatus status
    );

    boolean existsByOwnerIdAndTriggerTypeAndRecipientContact_IdAndStatus(
            Long ownerId,
            EstateTriggerType triggerType,
            Long recipientContactId,
            EstatePlaybookStatus status
    );

    List<EstatePlaybook> findByOwnerIdAndItemTypeAndItemIdAndStatusIn(
            Long ownerId,
            String itemType,
            Long itemId,
            Collection<EstatePlaybookStatus> statuses
    );

    boolean existsByRecipientContact_Id(Long recipientContactId);

    boolean existsByRecipientContact_IdAndStatusNot(
            Long recipientContactId,
            EstatePlaybookStatus status
    );

    List<EstatePlaybook> findByRecipientContact_IdAndStatusNot(
            Long recipientContactId,
            EstatePlaybookStatus status
    );

    boolean existsByOwnerIdAndItemTypeAndItemIdAndActionTypeAndStatus(
            Long ownerId,
            String itemType,
            Long itemId,
            EstateActionType actionType,
            EstatePlaybookStatus status
    );
}
