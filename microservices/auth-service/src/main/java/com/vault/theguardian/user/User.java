package com.vault.theguardian.user;

import com.fasterxml.jackson.annotation.JsonIgnore;
import jakarta.persistence.*;
import lombok.*;

import java.time.LocalDateTime;

@Entity
@Table(name = "users")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class User {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    private String fullName;

    @Column(unique = true, nullable = false)
    private String email;

    @Column(nullable = false)
    @JsonIgnore
    private String passwordHash;

    private LocalDateTime createdAt;

    @Column(nullable = false)
    private boolean emailVerified;

    private String emailVerificationCode;

    private LocalDateTime emailVerificationCodeExpiresAt;

    @Column(nullable = false)
    private boolean twoFactorEnabled;

    private String twoFactorCode;

    private LocalDateTime twoFactorCodeExpiresAt;

    private String passwordResetCode;

    private LocalDateTime passwordResetCodeExpiresAt;
}
