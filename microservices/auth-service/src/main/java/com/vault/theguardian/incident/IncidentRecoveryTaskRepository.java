package com.vault.theguardian.incident;

import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;

public interface IncidentRecoveryTaskRepository extends JpaRepository<IncidentRecoveryTask, Long> {
    List<IncidentRecoveryTask> findByIncidentIdOrderByDisplayOrderAsc(Long incidentId);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select t from IncidentRecoveryTask t where t.id = :taskId and t.incident.id = :incidentId")
    Optional<IncidentRecoveryTask> findForUpdate(
            @Param("incidentId") Long incidentId,
            @Param("taskId") Long taskId
    );
}
