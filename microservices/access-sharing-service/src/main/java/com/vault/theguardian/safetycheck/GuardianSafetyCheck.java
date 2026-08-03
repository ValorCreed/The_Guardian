package com.vault.theguardian.safetycheck;

import com.vault.theguardian.emergency.EmergencyAccessRequest;
import com.vault.theguardian.emergency.EmergencyContact;
import jakarta.persistence.*;
import lombok.*;

import java.time.Instant;

@Entity
@Table(
        name = "guardian_safety_checks",
        uniqueConstraints = @UniqueConstraint(
                name = "uk_guardian_safety_checks_owner",
                columnNames = "owner_id"
        )
)
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class GuardianSafetyCheck {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "owner_id", nullable = false)
    private Long ownerId;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "contact_id", nullable = false)
    private EmergencyContact contact;

    @Column(name = "interval_days", nullable = false)
    private int intervalDays;

    @Column(name = "grace_period_hours", nullable = false)
    private int gracePeriodHours;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 30)
    private SafetyCheckStatus status;

    @Column(name = "last_check_in_at")
    private Instant lastCheckInAt;

    @Column(name = "next_check_in_at")
    private Instant nextCheckInAt;

    @Column(name = "grace_started_at")
    private Instant graceStartedAt;

    @Column(name = "triggered_at")
    private Instant triggeredAt;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "triggered_request_id")
    private EmergencyAccessRequest triggeredRequest;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    @Version
    @Column(nullable = false)
    private long version;
}
