package com.vault.theguardian.family;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface FamilyMemberRepository extends JpaRepository<FamilyMember, Long> {
    List<FamilyMember> findByGroupOrderByJoinedAtAsc(FamilyGroup group);
    List<FamilyMember> findByUserId(Long userId);
    Optional<FamilyMember> findByGroupAndUserId(FamilyGroup group, Long userId);
    boolean existsByUserId(Long userId);
    long countByGroup(FamilyGroup group);
    Optional<FamilyMember> findByIdAndGroup(Long id, FamilyGroup group);
}
