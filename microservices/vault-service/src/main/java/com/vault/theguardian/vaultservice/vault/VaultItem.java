package com.vault.theguardian.vaultservice.vault;

import jakarta.persistence.*;
import lombok.*;

import java.time.LocalDateTime;

@Entity
@Table(name = "vault_items")
@Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder
public class VaultItem {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "user_id", nullable = false)
    private Long userId;

    @Column(name = "is_decoy", nullable = false)
    @Builder.Default
    private boolean decoy = false;

    private String title;
    private String usernameValue;

    @Column(nullable = false, columnDefinition = "TEXT")
    private String encryptedPassword;

    private String website;

    @Column(columnDefinition = "TEXT")
    private String notes;

    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;

    @PrePersist
    public void prePersist() {
        LocalDateTime now = LocalDateTime.now();
        if (createdAt == null) createdAt = now;
        if (updatedAt == null) updatedAt = now;
    }

    @PreUpdate
    public void preUpdate() { updatedAt = LocalDateTime.now(); }
}
