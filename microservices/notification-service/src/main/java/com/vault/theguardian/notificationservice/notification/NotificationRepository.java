package com.vault.theguardian.notificationservice.notification;

import org.springframework.data.jpa.repository.JpaRepository;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;

public interface NotificationRepository extends JpaRepository<AppNotification, Long> {
    List<AppNotification> findByUserIdOrderByCreatedAtDesc(Long userId);
    List<AppNotification> findTop20ByUserIdAndCreatedAtGreaterThanEqualOrderByCreatedAtDesc(
            Long userId,
            LocalDateTime createdAt
    );
    long countByUserIdAndReadFalse(Long userId);
    Optional<AppNotification> findByIdAndUserId(Long id, Long userId);
    void deleteByUserId(Long userId);
}
