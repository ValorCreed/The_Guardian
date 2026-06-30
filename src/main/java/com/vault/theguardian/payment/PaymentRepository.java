package com.vault.theguardian.payment;

import com.vault.theguardian.user.User;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface PaymentRepository extends JpaRepository<Payment, Long> {

    // We use reference to find and verify a payment.
    Optional<Payment> findByReference(String reference);

    // Used when a user permanently deletes their account.
    List<Payment> findByUser(User user);
}
