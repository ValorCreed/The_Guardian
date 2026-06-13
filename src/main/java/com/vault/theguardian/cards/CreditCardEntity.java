package com.vault.theguardian.cards;

import com.vault.theguardian.user.User;
import jakarta.persistence.*;
import lombok.*;

import java.time.LocalDateTime;

@Entity
@Table(name = "cards")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class CreditCardEntity {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    //The owner of the card
    @ManyToOne
    @JoinColumn(name = "user_id", nullable = false)
    private User user;

    //Such as My Visa Card
    private String cardName;

    @Column(columnDefinition = "TEXT")
    private String encryptedCardNumber;

    @Column(columnDefinition = "TEXT")
    private String encryptedExpiryDate;

    @Column(columnDefinition = "TEXT")
    private String encryptedCvv;

    @Column(columnDefinition = "TEXT")
    private String encryptedCardholderName;

    private LocalDateTime createdAt;


}
