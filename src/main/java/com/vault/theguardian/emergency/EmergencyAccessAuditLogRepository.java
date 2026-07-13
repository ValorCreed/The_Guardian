package com.vault.theguardian.emergency;

import com.vault.theguardian.user.User;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface EmergencyAccessAuditLogRepository extends JpaRepository<EmergencyAccessAuditLog, Long> {
    List<EmergencyAccessAuditLog> findByOwnerOrActorOrderByCreatedAtDesc(User owner, User actor);
}
