package com.vault.theguardian.notification;

import com.vault.theguardian.user.User;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface NotificationRepository extends JpaRepository<AppNotification, Long> {
    List<AppNotification> findByUserOrderByCreatedAtDesc(User user);
    long countByUserAndReadFalse(User user);
    Optional<AppNotification> findByIdAndUser(Long id, User user);
}
