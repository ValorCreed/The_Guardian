package com.vault.theguardian.subscription;

import com.vault.theguardian.user.User;
import jakarta.persistence.*;
import lombok.*;

import java.time.LocalDateTime;

@Entity
@Table(name = "subscriptions")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class Subscription {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private long id;

    @Enumerated(EnumType.STRING)
    private SubscriptionPlan plan;

    private boolean active;

    private LocalDateTime startedAt;

    private LocalDateTime expiresAt;

    @OneToOne
    @JoinColumn(name="user_id")
    private User user;
}
