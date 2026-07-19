package com.vault.theguardian.vaultservice.notes;

import jakarta.persistence.*;
import lombok.*;
import java.time.LocalDateTime;

@Entity
@Table(name = "secure_notes")
@Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder
public class SecureNote {
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;
    @Column(name = "user_id", nullable = false)
    private Long userId;
    @Column(nullable = false) private String title;
    private String category;
    @Column(nullable = false, columnDefinition = "TEXT") private String encryptedContent;
    @Column(nullable = false) private boolean pinned;
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;
}
