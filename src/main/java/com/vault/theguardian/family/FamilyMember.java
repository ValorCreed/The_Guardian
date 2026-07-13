package com.vault.theguardian.family;

import com.vault.theguardian.user.User;
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

    @ManyToOne
    @JoinColumn(name = "group_id", nullable = false)
    private FamilyGroup group;

    @ManyToOne
    @JoinColumn(name = "user_id", nullable = false)
    private User user;

    private LocalDateTime joinedAt;

    @Column(nullable = false)
    private boolean sharePasswords;

    @Column(nullable = false)
    private boolean shareCards;

    @Column(nullable = false)
    private boolean shareDocuments;

    @Column(nullable = false)
    private boolean shareNotes;
}
