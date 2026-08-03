package com.vault.theguardian.notificationservice.push;

import jakarta.persistence.*;
import lombok.*;

import java.time.LocalDateTime;

@Entity
@Table(
        name = "push_delivery_attempts",
        uniqueConstraints = @UniqueConstraint(
                name = "uk_push_delivery_notification_token",
                columnNames = {"notification_id", "push_token_id"}
        ),
        indexes = {
                @Index(
                        name = "idx_push_delivery_due",
                        columnList = "status, next_attempt_at"
                ),
                @Index(
                        name = "idx_push_delivery_ticket",
                        columnList = "expo_ticket_id"
                )
        }
)
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class PushDeliveryAttempt {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "notification_id", nullable = false)
    private Long notificationId;

    @Column(name = "push_token_id", nullable = false)
    private Long pushTokenId;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private PushDeliveryStatus status;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 24)
    private PushUrgency urgency;

    @Column(name = "channel_id", nullable = false, length = 80)
    private String channelId;

    @Column(name = "push_title", nullable = false, length = 255)
    private String pushTitle;

    @Column(name = "push_body", nullable = false, length = 600)
    private String pushBody;

    @Column(name = "action_route", length = 255)
    private String actionRoute;

    @Column(name = "notification_type", nullable = false, length = 80)
    private String notificationType;

    @Column(name = "expo_ticket_id", length = 180)
    private String expoTicketId;

    @Column(name = "error_code", length = 120)
    private String errorCode;

    @Column(name = "error_message", length = 1200)
    private String errorMessage;

    @Column(name = "attempt_count", nullable = false)
    private int attemptCount;

    @Column(name = "next_attempt_at", nullable = false)
    private LocalDateTime nextAttemptAt;

    @Column(name = "sent_at")
    private LocalDateTime sentAt;

    @Column(name = "receipt_checked_at")
    private LocalDateTime receiptCheckedAt;

    @Column(name = "created_at", nullable = false)
    private LocalDateTime createdAt;

    @Column(name = "updated_at", nullable = false)
    private LocalDateTime updatedAt;
}
