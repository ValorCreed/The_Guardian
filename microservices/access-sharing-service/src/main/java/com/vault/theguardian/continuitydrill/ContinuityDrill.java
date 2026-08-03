package com.vault.theguardian.continuitydrill;

import jakarta.persistence.*;
import lombok.*;

import java.time.Instant;

@Entity
@Table(name = "continuity_drills")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class ContinuityDrill {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "public_id", nullable = false, unique = true, length = 40)
    private String publicId;

    @Column(name = "owner_id", nullable = false)
    private Long ownerId;

    @Column(name = "owner_name_snapshot", nullable = false)
    private String ownerNameSnapshot;

    @Column(name = "owner_email_snapshot", nullable = false)
    private String ownerEmailSnapshot;

    @Column(name = "plan_snapshot", nullable = false, length = 20)
    private String planSnapshot;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private ContinuityDrillStatus status;

    @Column(nullable = false)
    private int score;

    @Column(name = "static_score", nullable = false)
    private int staticScore;

    @Column(name = "started_at", nullable = false)
    private Instant startedAt;

    @Column(name = "expires_at", nullable = false)
    private Instant expiresAt;

    @Column(name = "completed_at")
    private Instant completedAt;

    @Column(name = "cancelled_at")
    private Instant cancelledAt;

    @Version
    @Column(nullable = false)
    private long version;
}
