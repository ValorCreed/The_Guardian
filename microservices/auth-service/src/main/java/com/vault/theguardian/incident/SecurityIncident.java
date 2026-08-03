package com.vault.theguardian.incident;

import com.vault.theguardian.user.User;
import jakarta.persistence.*;
import lombok.*;

import java.time.LocalDateTime;

@Entity
@Table(
        name = "security_incidents",
        indexes = {
                @Index(name = "idx_security_incidents_owner_started", columnList = "owner_id, started_at"),
                @Index(name = "idx_security_incidents_status", columnList = "status")
        }
)
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class SecurityIncident {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "public_id", nullable = false, unique = true, length = 64)
    private String publicId;

    @ManyToOne(optional = false, fetch = FetchType.LAZY)
    @JoinColumn(name = "owner_id", nullable = false)
    private User owner;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 40)
    private SecurityIncidentType type;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 16)
    private SecurityIncidentStatus status;

    @Column(name = "plan_snapshot", nullable = false, length = 16)
    private String planSnapshot;

    @Column(name = "safe_session_token_id", nullable = false, length = 80)
    private String safeSessionTokenId;

    @Column(name = "safe_device_id_hash", length = 128)
    private String safeDeviceIdHash;

    @Column(name = "safe_device_name", length = 255)
    private String safeDeviceName;

    @Column(name = "user_note", columnDefinition = "TEXT")
    private String userNote;

    @Column(nullable = false)
    private int progress;

    @Column(name = "sessions_revoked", nullable = false)
    private int sessionsRevoked;

    @Column(name = "biometrics_revoked", nullable = false)
    private int biometricsRevoked;

    @Column(name = "started_at", nullable = false)
    private LocalDateTime startedAt;

    @Column(name = "updated_at", nullable = false)
    private LocalDateTime updatedAt;

    @Column(name = "completed_at")
    private LocalDateTime completedAt;

    @Column(name = "cancelled_at")
    private LocalDateTime cancelledAt;

    @Version
    private long version;

    @PrePersist
    public void prePersist() {
        LocalDateTime now = LocalDateTime.now();
        if (startedAt == null) startedAt = now;
        if (updatedAt == null) updatedAt = now;
        if (status == null) status = SecurityIncidentStatus.ACTIVE;
    }

    @PreUpdate
    public void preUpdate() {
        updatedAt = LocalDateTime.now();
    }
}
