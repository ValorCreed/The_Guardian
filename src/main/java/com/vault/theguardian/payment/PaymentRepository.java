package com.vault.theguardian.payment;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;

public interface PaymentRepository extends JpaRepository<Payment, Long> {

    // We use reference to find and verify a payment.
    Optional<Payment> findByReference(String reference);
}