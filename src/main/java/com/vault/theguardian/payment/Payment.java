package com.vault.theguardian.payment;
import com.vault.theguardian.subscription.SubscriptionPlan;
import com.vault.theguardian.user.User;
import jakarta.persistence.*;
import lombok.*;

import java.time.LocalDateTime;

@Entity
@Table(name= "payments")
@Getter @Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class Payment {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    //User paying for the plan
    @ManyToOne
    @JoinColumn(name = "user_id", nullable = false)
    private User user;

    //Paystack Reference used to verify the transaction.
    @Column(nullable = false, unique = true)
    private String reference;

    //PREMIUM OR FAMILY
    @Enumerated(EnumType.STRING)
    private SubscriptionPlan plan;

    //Amount in pesewas
    private Integer amount;

    //PENDING ,SUCCESS, FAILED
    private String status;

    //URL returned to paystack
    @Column(columnDefinition = "TEXT")
    private String authorizationUrl;

    private LocalDateTime createdAt;
    private LocalDateTime paidAt;

}
