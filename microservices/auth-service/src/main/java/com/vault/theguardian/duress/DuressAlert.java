package com.vault.theguardian.duress;

import com.vault.theguardian.user.User;
import jakarta.persistence.*;
import lombok.*;

import java.time.LocalDateTime;

@Entity
@Table(
        name = "duress_alerts",
        indexes = {
                @Index(name = "idx_duress_alerts_due", columnList = "status, send_at"),
                @Index(name = "idx_duress_alerts_user", columnList = "user_id, triggered_at")
        },
        uniqueConstraints = @UniqueConstraint(
                name = "uk_duress_alert_session",
                columnNames = "duress_session_token_id"
        )
)
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class DuressAlert {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "user_id", nullable = false)
    private User user;

    @Column(name = "duress_session_token_id", nullable = false, length = 80)
    private String duressSessionTokenId;

    @Column(name = "recipient_user_id")
    private Long recipientUserId;

    @Column(name = "recipient_email")
    private String recipientEmail;

    @Column(name = "recipient_name")
    private String recipientName;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 16)
    private DuressAlertStatus status;

    @Column(name = "triggered_at", nullable = false)
    private LocalDateTime triggeredAt;

    @Column(name = "send_at", nullable = false)
    private LocalDateTime sendAt;

    @Column(name = "cancelled_at")
    private LocalDateTime cancelledAt;

    @Column(name = "sent_at")
    private LocalDateTime sentAt;

    @Version
    private long version;
}
