package com.vault.theguardian.family;

import com.vault.theguardian.user.User;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface FamilyMemberRepository extends JpaRepository<FamilyMember, Long> {
    List<FamilyMember> findByGroup(FamilyGroup group);
    List<FamilyMember> findByUser(User user);
    boolean existsByGroupAndUser(FamilyGroup group, User user);
    boolean existsByUser(User user);
    long countByGroup(FamilyGroup group);
    Optional<FamilyMember> findByIdAndGroup(Long id, FamilyGroup group);
}
