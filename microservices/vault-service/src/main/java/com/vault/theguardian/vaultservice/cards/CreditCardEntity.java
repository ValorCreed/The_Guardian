package com.vault.theguardian.vaultservice.cards;

import jakarta.persistence.*;
import lombok.*;

import java.time.LocalDateTime;

@Entity
@Table(name = "cards")
@Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder
public class CreditCardEntity {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "user_id", nullable = false)
    private Long userId;

    private String cardName;
    @Column(columnDefinition = "TEXT") private String encryptedCardNumber;
    @Column(columnDefinition = "TEXT") private String encryptedExpiryDate;
    @Column(columnDefinition = "TEXT") private String encryptedCvv;
    @Column(columnDefinition = "TEXT") private String encryptedCardholderName;
    @Column(columnDefinition = "TEXT") private String encryptedNotes;
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;
}
