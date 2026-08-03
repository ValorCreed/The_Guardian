package com.vault.theguardian.incident;

import org.springframework.data.jpa.repository.JpaRepository;
import java.util.List;

public interface IncidentTimelineEventRepository extends JpaRepository<IncidentTimelineEvent, Long> {
    List<IncidentTimelineEvent> findByIncidentIdOrderByCreatedAtDesc(Long incidentId);
}
