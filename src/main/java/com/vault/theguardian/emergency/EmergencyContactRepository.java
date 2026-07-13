package com.vault.theguardian.emergency;

import com.vault.theguardian.user.User;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface EmergencyContactRepository extends JpaRepository<EmergencyContact, Long> {
    List<EmergencyContact> findByOwnerOrderByCreatedAtDesc(User owner);
    Optional<EmergencyContact> findByIdAndOwner(Long id, User owner);
    Optional<EmergencyContact> findByOwnerAndContactEmailIgnoreCase(User owner, String contactEmail);
    Optional<EmergencyContact> findByOwnerAndContactEmailIgnoreCaseAndActiveTrue(User owner, String contactEmail);
    long countByOwner(User owner);
}
