package com.vault.theguardian.notificationservice.push;

import jakarta.persistence.*;
import lombok.*;

import java.time.LocalDateTime;

@Entity
@Table(
        name = "push_tokens",
        uniqueConstraints = {
                @UniqueConstraint(name = "uk_push_tokens_expo_token", columnNames = "expo_push_token"),
                @UniqueConstraint(
                        name = "uk_push_tokens_user_installation",
                        columnNames = {"user_id", "installation_id"}
                )
        },
        indexes = {
                @Index(name = "idx_push_tokens_user_enabled", columnList = "user_id, enabled")
        }
)
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class PushToken {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "user_id", nullable = false)
    private Long userId;

    @Column(name = "installation_id", nullable = false, length = 160)
    private String installationId;

    @Column(name = "expo_push_token", nullable = false, length = 255)
    private String expoPushToken;

    @Column(nullable = false, length = 20)
    private String platform;

    @Column(name = "device_name", nullable = false, length = 180)
    private String deviceName;

    @Column(name = "app_version", length = 60)
    private String appVersion;

    @Column(nullable = false)
    private boolean enabled;

    @Column(name = "created_at", nullable = false)
    private LocalDateTime createdAt;

    @Column(name = "updated_at", nullable = false)
    private LocalDateTime updatedAt;

    @Column(name = "last_seen_at", nullable = false)
    private LocalDateTime lastSeenAt;
}
