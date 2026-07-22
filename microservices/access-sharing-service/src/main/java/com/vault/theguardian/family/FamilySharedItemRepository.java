package com.vault.theguardian.family;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface FamilySharedItemRepository extends JpaRepository<FamilySharedItem, Long> {
    List<FamilySharedItem> findByMembership_IdAndItemType(Long membershipId, String itemType);

    boolean existsByMembership_IdAndItemTypeAndItemId(
            Long membershipId,
            String itemType,
            Long itemId
    );

    void deleteByMembership_Id(Long membershipId);
}
