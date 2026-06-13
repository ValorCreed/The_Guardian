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

    /*
     * Document owner.
     */
    @ManyToOne
    @JoinColumn(name = "user_id", nullable = false)
    private User user;

    private String documentName;

    private String documentType;

    /*
     * This could be an encrypted cloud file URL later.
     */
    @Column(columnDefinition = "TEXT")
    private String encryptedFileUrl;

    @Column(columnDefinition = "TEXT")
    private String encryptedNotes;

    private LocalDateTime createdAt;
}