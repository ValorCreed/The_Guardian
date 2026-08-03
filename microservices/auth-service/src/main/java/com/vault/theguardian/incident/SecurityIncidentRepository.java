package com.vault.theguardian.incident;

import com.vault.theguardian.user.User;
import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;

public interface SecurityIncidentRepository extends JpaRepository<SecurityIncident, Long> {
    Optional<SecurityIncident> findFirstByOwnerAndStatusOrderByStartedAtDesc(
            User owner,
            SecurityIncidentStatus status
    );

    Optional<SecurityIncident> findFirstByOwnerIdAndStatusOrderByStartedAtDesc(
            Long ownerId,
            SecurityIncidentStatus status
    );

    List<SecurityIncident> findTop5ByOwnerOrderByStartedAtDesc(User owner);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select i from SecurityIncident i where i.owner.id = :ownerId and i.status = com.vault.theguardian.incident.SecurityIncidentStatus.ACTIVE")
    Optional<SecurityIncident> findActiveForOwnerUpdate(@Param("ownerId") Long ownerId);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select i from SecurityIncident i where i.id = :incidentId and i.owner.id = :ownerId")
    Optional<SecurityIncident> findOwnedForUpdate(
            @Param("incidentId") Long incidentId,
            @Param("ownerId") Long ownerId
    );

    boolean existsByOwnerIdAndStatus(Long ownerId, SecurityIncidentStatus status);
}
