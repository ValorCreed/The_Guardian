package com.vault.theguardian.backuprecovery.recoverycircle;

import jakarta.persistence.*;
import lombok.*;

import java.time.LocalDateTime;

@Entity
@Table(name = "recovery_circle_requests")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class RecoveryCircleRequest {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "circle_id", nullable = false)
    private RecoveryCircle circle;

    @Column(name = "owner_id", nullable = false)
    private Long ownerId;

    @Column(name = "public_id", nullable = false, unique = true)
    private String publicId;

    @Column(name = "recovery_code_hash", nullable = false)
    private String recoveryCodeHash;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private RecoveryCircleRequestStatus status;

    @Column(name = "approval_count", nullable = false)
    private int approvalCount;

    @Column(name = "denial_count", nullable = false)
    private int denialCount;

    @Column(name = "created_at", nullable = false)
    private LocalDateTime createdAt;

    @Column(name = "expires_at", nullable = false)
    private LocalDateTime expiresAt;

    @Column(name = "approved_at")
    private LocalDateTime approvedAt;

    @Column(name = "completed_at")
    private LocalDateTime completedAt;

    @Column(name = "cancelled_at")
    private LocalDateTime cancelledAt;
}
