package com.vault.theguardian.emergency;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface EmergencyContactRepository extends JpaRepository<EmergencyContact, Long> {
    List<EmergencyContact> findByOwnerIdOrderByCreatedAtDesc(Long ownerId);
    List<EmergencyContact> findByContactUserId(Long contactUserId);
    Optional<EmergencyContact> findByIdAndOwnerId(Long id, Long ownerId);
    Optional<EmergencyContact> findByOwnerIdAndContactEmailIgnoreCase(Long ownerId, String contactEmail);
    Optional<EmergencyContact> findByOwnerIdAndContactEmailIgnoreCaseAndActiveTrue(
            Long ownerId, String contactEmail
    );
    long countByOwnerId(Long ownerId);
    boolean existsByOwnerIdAndContactUserIdAndActiveTrue(Long ownerId, Long contactUserId);
}
