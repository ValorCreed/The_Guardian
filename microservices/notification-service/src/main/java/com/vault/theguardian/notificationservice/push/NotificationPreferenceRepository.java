package com.vault.theguardian.notificationservice.push;

import org.springframework.data.jpa.repository.JpaRepository;

public interface NotificationPreferenceRepository
        extends JpaRepository<NotificationPreference, Long> {
}
