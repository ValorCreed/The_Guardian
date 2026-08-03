package com.vault.theguardian.backuprecovery.recoverycircle;

import jakarta.persistence.*;
import lombok.*;

import java.time.LocalDateTime;

@Entity
@Table(
        name = "recovery_circle_votes",
        uniqueConstraints = @UniqueConstraint(
                name = "uk_recovery_circle_vote",
                columnNames = {"request_id", "member_user_id"}
        )
)
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class RecoveryCircleVote {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "request_id", nullable = false)
    private RecoveryCircleRequest request;

    @Column(name = "member_user_id", nullable = false)
    private Long memberUserId;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private RecoveryCircleVoteDecision decision;

    @Column(name = "decided_at", nullable = false)
    private LocalDateTime decidedAt;
}
