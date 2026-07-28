package com.vault.theguardian.registration;

import jakarta.persistence.*;
import lombok.*;

import java.time.LocalDateTime;

@Entity
@Table(
        name = "pending_registrations",
        uniqueConstraints = @UniqueConstraint(
                name = "uk_pending_registration_email",
                columnNames = "email"
        )
)
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class PendingRegistration {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "full_name", nullable = false, length = 150)
    private String fullName;

    @Column(nullable = false, length = 150)
    private String email;

    /** Password is encoded before it reaches this table; raw passwords are never stored. */
    @Column(name = "password_hash", nullable = false, columnDefinition = "TEXT")
    private String passwordHash;

    /** The six-digit email code is BCrypt-hashed before storage. */
    @Column(name = "verification_code_hash", nullable = false, columnDefinition = "TEXT")
    private String verificationCodeHash;

    @Column(name = "verification_code_expires_at", nullable = false)
    private LocalDateTime verificationCodeExpiresAt;

    @Column(name = "created_at", nullable = false)
    private LocalDateTime createdAt;

    @Column(name = "updated_at", nullable = false)
    private LocalDateTime updatedAt;
}
