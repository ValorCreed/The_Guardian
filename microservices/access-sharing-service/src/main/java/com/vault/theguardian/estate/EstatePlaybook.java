package com.vault.theguardian.estate;

import com.vault.theguardian.emergency.EmergencyContact;
import jakarta.persistence.*;
import lombok.*;

import java.time.Instant;

@Entity
@Table(name = "estate_playbooks")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class EstatePlaybook {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "owner_id", nullable = false)
    private Long ownerId;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "recipient_contact_id")
    private EmergencyContact recipientContact;

    @Column(name = "item_type", nullable = false, length = 20)
    private String itemType;

    @Column(name = "item_id", nullable = false)
    private Long itemId;

    @Column(name = "item_title_snapshot", nullable = false)
    private String itemTitleSnapshot;

    @Enumerated(EnumType.STRING)
    @Column(name = "action_type", nullable = false, length = 30)
    private EstateActionType actionType;

    @Enumerated(EnumType.STRING)
    @Column(name = "trigger_type", nullable = false, length = 30)
    private EstateTriggerType triggerType;

    @Column(name = "encrypted_instructions", columnDefinition = "TEXT")
    private String encryptedInstructions;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private EstatePlaybookStatus status;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    @Version
    @Column(nullable = false)
    private long version;
}
