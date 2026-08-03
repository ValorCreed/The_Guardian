package com.vault.theguardian.notificationservice.push;

import jakarta.persistence.*;
import lombok.*;

import java.time.LocalDateTime;

@Entity
@Table(name = "notification_preferences")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class NotificationPreference {
    @Id
    @Column(name = "user_id")
    private Long userId;

    @Column(name = "push_enabled", nullable = false)
    private boolean pushEnabled;

    @Column(name = "security_alerts", nullable = false)
    private boolean securityAlerts;

    @Column(name = "emergency_recovery", nullable = false)
    private boolean emergencyRecovery;

    @Column(name = "continuity_reminders", nullable = false)
    private boolean continuityReminders;

    @Column(name = "billing", nullable = false)
    private boolean billing;

    @Column(name = "product_updates", nullable = false)
    private boolean productUpdates;

    @Column(name = "updated_at", nullable = false)
    private LocalDateTime updatedAt;
}
