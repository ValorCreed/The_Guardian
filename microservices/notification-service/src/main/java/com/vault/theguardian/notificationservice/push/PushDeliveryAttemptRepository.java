package com.vault.theguardian.notificationservice.push;

import jakarta.persistence.LockModeType;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.LocalDateTime;
import java.util.Collection;
import java.util.List;
import java.util.Optional;

public interface PushDeliveryAttemptRepository
        extends JpaRepository<PushDeliveryAttempt, Long> {

    @Query("""
            select a.id
            from PushDeliveryAttempt a
            where a.status in :statuses
              and a.nextAttemptAt <= :now
            order by a.createdAt asc
            """)
    List<Long> findDueIds(
            @Param("statuses") Collection<PushDeliveryStatus> statuses,
            @Param("now") LocalDateTime now,
            Pageable pageable
    );

    @Query("""
            select a.id
            from PushDeliveryAttempt a
            where a.status = :status
              and a.expoTicketId is not null
              and a.sentAt <= :before
              and a.receiptCheckedAt is null
            order by a.sentAt asc
            """)
    List<Long> findReceiptDueIds(
            @Param("status") PushDeliveryStatus status,
            @Param("before") LocalDateTime before,
            Pageable pageable
    );

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select a from PushDeliveryAttempt a where a.id = :id")
    Optional<PushDeliveryAttempt> findByIdForUpdate(@Param("id") Long id);
}
