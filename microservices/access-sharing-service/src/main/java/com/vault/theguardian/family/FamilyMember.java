package com.vault.theguardian.family;

import jakarta.persistence.*;
import lombok.*;

import java.time.LocalDateTime;

@Entity
@Table(
        name = "family_members",
        uniqueConstraints = {
                @UniqueConstraint(columnNames = {"group_id", "user_id"}),
                @UniqueConstraint(columnNames = {"user_id"})
        }
)
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class FamilyMember {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "group_id", nullable = false)
    private FamilyGroup group;

    @Column(name = "user_id", nullable = false)
    private Long userId;

    @Column(name = "joined_at")
    private LocalDateTime joinedAt;

    @Column(name = "share_passwords", nullable = false)
    private boolean sharePasswords;

    @Column(name = "share_cards", nullable = false)
    private boolean shareCards;

    @Column(name = "share_documents", nullable = false)
    private boolean shareDocuments;

    @Column(name = "share_notes", nullable = false)
    private boolean shareNotes;
}
