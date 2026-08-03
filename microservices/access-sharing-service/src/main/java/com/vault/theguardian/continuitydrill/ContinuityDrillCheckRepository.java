package com.vault.theguardian.continuitydrill;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface ContinuityDrillCheckRepository extends JpaRepository<ContinuityDrillCheck, Long> {
    List<ContinuityDrillCheck> findByDrillIdOrderByDisplayOrderAsc(Long drillId);
}
