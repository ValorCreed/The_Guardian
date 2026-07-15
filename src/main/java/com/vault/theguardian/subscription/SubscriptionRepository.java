package com.vault.theguardian.subscription;
import com.vault.theguardian.user.User;

import org.springframework.data.jpa.repository.JpaRepository;
import java.util.Optional;

//This repo helps us find a user's current subscription

public interface SubscriptionRepository extends JpaRepository<Subscription, Long> {
    Optional<Subscription> findByUser(User user);

    /*
     * Safer lookup for authenticated requests.
     * The @AuthenticationPrincipal User can be a detached entity from the session,
     * so checking by the user's id avoids rare false "not family" results.
     */
    Optional<Subscription> findByUserId(Long userId);
}
