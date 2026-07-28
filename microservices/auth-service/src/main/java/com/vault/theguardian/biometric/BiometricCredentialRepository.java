package com.vault.theguardian.biometric;

import com.vault.theguardian.user.User;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface BiometricCredentialRepository extends JpaRepository<BiometricCredential, Long> {
    Optional<BiometricCredential> findByTokenHashAndRevokedAtIsNull(String tokenHash);

    List<BiometricCredential> findByUserAndDeviceIdHashAndRevokedAtIsNull(
            User user,
            String deviceIdHash
    );

    List<BiometricCredential> findByUserAndRevokedAtIsNull(User user);
}
