package com.vault.theguardian.emergency;

import com.vault.theguardian.user.User;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface EmergencyAccessRequestRepository extends JpaRepository<EmergencyAccessRequest, Long> {
    List<EmergencyAccessRequest> findByOwnerOrderByRequestedAtDesc(User owner);
    List<EmergencyAccessRequest> findByRequesterOrderByRequestedAtDesc(User requester);
    Optional<EmergencyAccessRequest> findByIdAndOwner(Long id, User owner);
    Optional<EmergencyAccessRequest> findByIdAndRequester(Long id, User requester);
    Optional<EmergencyAccessRequest> findByContactAndRequesterAndStatus(EmergencyContact contact, User requester, EmergencyAccessStatus status);
}
