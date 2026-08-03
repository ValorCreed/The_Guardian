package com.vault.theguardian.vaultservice.cards;

import org.springframework.data.jpa.repository.JpaRepository;
import java.util.List;
import java.util.Optional;

public interface CreditCardRepository extends JpaRepository<CreditCardEntity, Long> {
    List<CreditCardEntity> findByUserIdAndDecoyOrderByCreatedAtDesc(Long userId, boolean decoy);
    Optional<CreditCardEntity> findByIdAndUserIdAndDecoy(Long id, Long userId, boolean decoy);
}
