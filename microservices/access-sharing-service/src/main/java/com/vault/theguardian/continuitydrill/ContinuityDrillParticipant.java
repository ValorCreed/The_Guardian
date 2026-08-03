package com.vault.theguardian.continuitydrill;

import jakarta.persistence.*;
import lombok.*;

import java.time.Instant;

@Entity
@Table(
        name = "continuity_drill_participants",
        uniqueConstraints = @UniqueConstraint(
                name = "uk_continuity_drill_participant",
                columnNames = {"drill_id", "participant_user_id"}
        )
)
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class ContinuityDrillParticipant {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "drill_id", nullable = false)
    private ContinuityDrill drill;

    @Column(name = "participant_user_id")
    private Long participantUserId;

    @Column(name = "participant_name_snapshot", nullable = false)
    private String participantNameSnapshot;

    @Column(name = "participant_email_snapshot", nullable = false)
    private String participantEmailSnapshot;

    @Column(name = "roles_snapshot", nullable = false, length = 500)
    private String rolesSnapshot;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private ContinuityParticipantStatus status;

    @Column(name = "notified_at")
    private Instant notifiedAt;

    @Column(name = "acknowledged_at")
    private Instant acknowledgedAt;

    @Version
    @Column(nullable = false)
    private long version;
}
