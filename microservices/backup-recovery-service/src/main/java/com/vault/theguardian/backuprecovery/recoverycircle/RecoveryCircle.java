package com.vault.theguardian.backuprecovery.recoverycircle;

import jakarta.persistence.*;
import lombok.*;

import java.time.LocalDateTime;

@Entity
@Table(name = "recovery_circles")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class RecoveryCircle {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "owner_id", nullable = false, unique = true)
    private Long ownerId;

    @Column(name = "approval_threshold", nullable = false)
    private int approvalThreshold;

    @Column(name = "recovery_code_hash", nullable = false)
    private String recoveryCodeHash;

    @Column(nullable = false)
    private boolean active;

    @Column(name = "created_at", nullable = false)
    private LocalDateTime createdAt;

    @Column(name = "updated_at", nullable = false)
    private LocalDateTime updatedAt;
}
