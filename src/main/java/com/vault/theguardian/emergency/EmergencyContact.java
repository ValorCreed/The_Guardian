package com.vault.theguardian.emergency;

import com.vault.theguardian.user.User;
import jakarta.persistence.*;
import lombok.*;

import java.time.LocalDateTime;

@Entity
@Table(
        name = "emergency_contacts",
        uniqueConstraints = {
                @UniqueConstraint(columnNames = {"owner_id", "contact_email"})
        }
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

    @ManyToOne
    @JoinColumn(name = "owner_id", nullable = false)
    private User owner;

    @ManyToOne
    @JoinColumn(name = "contact_user_id")
    private User contactUser;

    @Column(name = "contact_email", nullable = false)
    private String contactEmail;

    private String contactName;

    private String relationship;

    @Column(nullable = false)
    private int waitingPeriodHours;

    @Column(nullable = false)
    private boolean allowPasswords;

    @Column(nullable = false)
    private boolean allowCards;

    @Column(nullable = false)
    private boolean allowDocuments;

    @Column(nullable = false)
    private boolean allowNotes;

    @Column(columnDefinition = "TEXT")
    private String encryptedEmergencyNote;

    @Column(nullable = false)
    private boolean active;

    @Column(nullable = false)
    private LocalDateTime createdAt;

    @Column(nullable = false)
    private LocalDateTime updatedAt;
}
