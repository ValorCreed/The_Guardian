package com.vault.theguardian.cards;

import com.vault.theguardian.user.User;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface CreditCardRepository extends JpaRepository<CreditCardEntity,Long> {

    //Finds only the cards thst belong to the logged in user
    List<CreditCardEntity> findByUser(User user);
}
