package com.vault.theguardian.legal;

import com.vault.theguardian.user.User;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;

public interface UserLegalConsentRepository extends JpaRepository<UserLegalConsent, Long> {
    Optional<UserLegalConsent> findByUserAndConsentVersion(User user, String consentVersion);
}
