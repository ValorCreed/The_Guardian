package com.vault.theguardian.notificationservice.push;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface PushTokenRepository extends JpaRepository<PushToken, Long> {
    Optional<PushToken> findByExpoPushToken(String expoPushToken);
    Optional<PushToken> findByUserIdAndInstallationId(Long userId, String installationId);
    List<PushToken> findByUserIdAndEnabledTrue(Long userId);
    void deleteByUserId(Long userId);
}
