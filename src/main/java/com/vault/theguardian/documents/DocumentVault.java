package com.vault.theguardian.documents;

import com.vault.theguardian.user.User;
import jakarta.persistence.*;
import lombok.*;

import java.time.LocalDateTime;

@Entity
@Table(name = "documents")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class DocumentVault {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne
    @JoinColumn(name = "user_id", nullable = false)
    private User user;

    private String documentName;

    private String documentType;

    /*
     * Legacy/database storage field.
     * Existing documents may still have encrypted Base64 file data here.
     * New Backblaze B2 documents store the encrypted object in B2 and keep this empty.
     */
    @Column(columnDefinition = "TEXT")
    private String encryptedFileUrl;

    @Column(columnDefinition = "TEXT")
    private String encryptedNotes;

    /*
     * New object-storage fields.
     * storageProvider values:
     * - B2       => encrypted bytes are in Backblaze B2 at storageKey
     * - DATABASE => legacy encrypted Base64 is still in encryptedFileUrl
     */
    private String storageProvider;

    @Column(columnDefinition = "TEXT")
    private String storageKey;

    private Long sizeBytes;

    private LocalDateTime createdAt;
}
