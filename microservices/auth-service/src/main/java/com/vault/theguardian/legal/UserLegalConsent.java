package com.vault.theguardian.legal;

import com.vault.theguardian.user.User;
import jakarta.persistence.*;
import lombok.*;

import java.time.LocalDateTime;

@Entity
@Table(
        name = "user_legal_consents",
        uniqueConstraints = @UniqueConstraint(
                name = "uq_user_legal_consent_version",
                columnNames = {"user_id", "consent_version"}
        )
)
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class UserLegalConsent {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(optional = false)
    @JoinColumn(name = "user_id", nullable = false)
    private User user;

    @Column(name = "consent_version", nullable = false, length = 40)
    private String consentVersion;

    @Column(name = "privacy_accepted", nullable = false)
    private boolean privacyAccepted;

    @Column(name = "terms_accepted", nullable = false)
    private boolean termsAccepted;

    @Column(name = "accepted_at", nullable = false)
    private LocalDateTime acceptedAt;

    @Column(name = "client_source", nullable = false, length = 40)
    private String clientSource;
}
