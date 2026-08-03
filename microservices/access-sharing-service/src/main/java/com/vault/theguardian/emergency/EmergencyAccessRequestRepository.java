package com.vault.theguardian.emergency;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Collection;
import java.util.List;
import java.util.Optional;

public interface EmergencyAccessRequestRepository extends JpaRepository<EmergencyAccessRequest, Long> {
    List<EmergencyAccessRequest> findByOwnerIdOrderByRequestedAtDesc(Long ownerId);
    List<EmergencyAccessRequest> findByRequesterIdOrderByRequestedAtDesc(Long requesterId);
    Optional<EmergencyAccessRequest> findByIdAndOwnerId(Long id, Long ownerId);
    Optional<EmergencyAccessRequest> findByIdAndRequesterId(Long id, Long requesterId);
    Optional<EmergencyAccessRequest> findByContactAndRequesterIdAndStatus(
            EmergencyContact contact,
            Long requesterId,
            EmergencyAccessStatus status
    );

    Optional<EmergencyAccessRequest> findFirstByContactAndRequesterIdAndStatusInOrderByRequestedAtDesc(
            EmergencyContact contact,
            Long requesterId,
            Collection<EmergencyAccessStatus> statuses
    );
}
