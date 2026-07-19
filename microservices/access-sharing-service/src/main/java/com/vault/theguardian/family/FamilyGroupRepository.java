package com.vault.theguardian.family;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;

public interface FamilyGroupRepository extends JpaRepository<FamilyGroup, Long> {
    Optional<FamilyGroup> findByAdminId(Long adminId);
}
