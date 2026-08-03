package com.vault.theguardian.backuprecovery.recoverycircle;

import jakarta.persistence.*;
import lombok.*;

import java.time.LocalDateTime;

@Entity
@Table(
        name = "recovery_circle_members",
        uniqueConstraints = @UniqueConstraint(
                name = "uk_recovery_circle_member",
                columnNames = {"circle_id", "member_user_id"}
        )
)
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class RecoveryCircleMember {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "circle_id", nullable = false)
    private RecoveryCircle circle;

    @Column(name = "member_user_id", nullable = false)
    private Long memberUserId;

    @Column(name = "member_email", nullable = false)
    private String memberEmail;

    @Column(name = "member_name", nullable = false)
    private String memberName;

    @Column(name = "created_at", nullable = false)
    private LocalDateTime createdAt;
}
