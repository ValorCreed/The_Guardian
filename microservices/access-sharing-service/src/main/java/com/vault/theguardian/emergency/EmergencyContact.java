package com.vault.theguardian.emergency;

import jakarta.persistence.*;
import lombok.*;

import java.time.LocalDateTime;

@Entity
@Table(
        name = "emergency_contacts",
        uniqueConstraints = @UniqueConstraint(columnNames = {"owner_id", "contact_email"})
)
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class EmergencyContact {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "owner_id", nullable = false)
    private Long ownerId;

    @Column(name = "contact_user_id")
    private Long contactUserId;

    @Column(name = "contact_email", nullable = false)
    private String contactEmail;

    @Column(name = "contact_name")
    private String contactName;

    private String relationship;

    @Column(name = "waiting_period_hours", nullable = false)
    private int waitingPeriodHours;

    @Column(name = "allow_passwords", nullable = false)
    private boolean allowPasswords;

    @Column(name = "allow_cards", nullable = false)
    private boolean allowCards;

    @Column(name = "allow_documents", nullable = false)
    private boolean allowDocuments;

    @Column(name = "allow_notes", nullable = false)
    private boolean allowNotes;

    @Column(name = "encrypted_emergency_note", columnDefinition = "TEXT")
    private String encryptedEmergencyNote;

    @Column(nullable = false)
    private boolean active;

    @Column(name = "created_at", nullable = false)
    private LocalDateTime createdAt;

    @Column(name = "updated_at", nullable = false)
    private LocalDateTime updatedAt;
}
