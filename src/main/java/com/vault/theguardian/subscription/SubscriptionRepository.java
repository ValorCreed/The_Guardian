package com.vault.theguardian.subscription;
import com.vault.theguardian.user.User;

import org.springframework.data.jpa.repository.JpaRepository;
import java.util.Optional;

//This repo helps us find a user's current subscription

public interface SubscriptionRepository extends JpaRepository<Subscription, Long> {
    Optional<Subscription> findByUser(User user);
}
