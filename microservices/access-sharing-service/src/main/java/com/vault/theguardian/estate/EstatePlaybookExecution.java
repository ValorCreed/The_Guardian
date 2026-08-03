package com.vault.theguardian.estate;

import com.vault.theguardian.emergency.EmergencyContact;
import jakarta.persistence.*;
import lombok.*;

import java.time.Instant;

@Entity
@Table(name = "estate_playbook_executions")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class EstatePlaybookExecution {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "playbook_id", nullable = false)
    private EstatePlaybook playbook;

    @Column(name = "owner_id", nullable = false)
    private Long ownerId;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "recipient_contact_id", nullable = false)
    private EmergencyContact recipientContact;

    @Column(name = "recipient_user_id", nullable = false)
    private Long recipientUserId;

    @Column(name = "recipient_email_snapshot", nullable = false)
    private String recipientEmailSnapshot;

    @Column(name = "recipient_name_snapshot", nullable = false)
    private String recipientNameSnapshot;

    @Column(name = "item_type_snapshot", nullable = false, length = 20)
    private String itemTypeSnapshot;

    @Column(name = "item_id_snapshot", nullable = false)
    private Long itemIdSnapshot;

    @Column(name = "item_title_snapshot", nullable = false)
    private String itemTitleSnapshot;

    @Enumerated(EnumType.STRING)
    @Column(name = "action_type_snapshot", nullable = false, length = 30)
    private EstateActionType actionTypeSnapshot;

    @Column(name = "encrypted_instructions_snapshot", columnDefinition = "TEXT")
    private String encryptedInstructionsSnapshot;

    @Enumerated(EnumType.STRING)
    @Column(name = "source_type", nullable = false, length = 30)
    private EstateExecutionSource sourceType;

    @Column(name = "source_reference_id")
    private Long sourceReferenceId;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private EstateExecutionStatus status;

    @Column(name = "released_at", nullable = false)
    private Instant releasedAt;

    @Column(name = "viewed_at")
    private Instant viewedAt;

    @Column(name = "completed_at")
    private Instant completedAt;

    @Column(name = "cancelled_at")
    private Instant cancelledAt;
}
