package com.vault.theguardian.emergency;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface EmergencyAccessAuditLogRepository
        extends JpaRepository<EmergencyAccessAuditLog, Long> {

    List<EmergencyAccessAuditLog> findByOwnerIdOrActorIdOrderByCreatedAtDesc(
            Long ownerId,
            Long actorId
    );
}
