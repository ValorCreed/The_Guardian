package com.vault.theguardian.family;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;

public interface FamilySharedItemRepository extends JpaRepository<FamilySharedItem, Long> {
    List<FamilySharedItem> findByMembership_IdAndItemType(Long membershipId, String itemType);

    boolean existsByMembership_IdAndItemTypeAndItemId(
            Long membershipId,
            String itemType,
            Long itemId
    );

    /**
     * Execute the removal immediately in the database before replacement rows
     * are inserted. A derived entity-delete can remain queued in Hibernate until
     * flush time, while inserts are executed first. That ordering violates the
     * unique (membership_id, item_type, item_id) constraint when an unchanged
     * item is selected again during an access update.
     */
    @Modifying(flushAutomatically = true, clearAutomatically = false)
    @Query("delete from FamilySharedItem item where item.membership.id = :membershipId")
    int deleteAllByMembershipId(@Param("membershipId") Long membershipId);
}