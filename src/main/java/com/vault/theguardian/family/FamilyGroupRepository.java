package com.vault.theguardian.family;

import com.vault.theguardian.user.User;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;

public interface FamilyGroupRepository extends JpaRepository<FamilyGroup, Long> {
    Optional<FamilyGroup> findByAdmin(User admin);
    Optional<FamilyGroup> findByAdminId(Long adminId);
}
