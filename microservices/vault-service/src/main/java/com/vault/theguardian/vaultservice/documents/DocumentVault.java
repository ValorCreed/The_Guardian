package com.vault.theguardian.vaultservice.documents;

import jakarta.persistence.*;
import lombok.*;
import java.time.LocalDateTime;

@Entity
@Table(name = "documents")
@Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder
public class DocumentVault {
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;
    @Column(name = "user_id", nullable = false)
    private Long userId;

    @Column(name = "is_decoy", nullable = false)
    @Builder.Default
    private boolean decoy = false;
    private String documentName;
    private String documentType;
    @Column(columnDefinition = "TEXT") private String encryptedFileUrl;
    @Column(columnDefinition = "TEXT") private String encryptedNotes;
    private String storageProvider;
    @Column(columnDefinition = "TEXT") private String storageKey;
    private Long sizeBytes;
    private LocalDateTime createdAt;
}
