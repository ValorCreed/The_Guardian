package com.vault.theguardian.vaultservice.cards;

import org.springframework.data.jpa.repository.JpaRepository;
import java.util.List;

public interface CreditCardRepository extends JpaRepository<CreditCardEntity, Long> {
    List<CreditCardEntity> findByUserIdOrderByCreatedAtDesc(Long userId);
}
