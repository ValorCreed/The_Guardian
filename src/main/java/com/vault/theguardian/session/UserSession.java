package com.vault.theguardian.session;

import com.vault.theguardian.user.User;
import jakarta.persistence.*;
import lombok.*;

import java.time.LocalDateTime;

@Entity
@Table(
        name = "user_sessions",
        indexes = {
                @Index(name = "idx_user_sessions_token_id", columnList = "token_id"),
                @Index(name = "idx_user_sessions_user_id", columnList = "user_id")
        }
)
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class UserSession {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    /*
     * This value is stored as the JWT ID (jti).
     * If this session is revoked, the token becomes unusable.
     */
    @Column(name = "token_id", unique = true, nullable = false, length = 80)
    private String tokenId;

    @ManyToOne(optional = false)
    @JoinColumn(name = "user_id", nullable = false)
    private User user;

    @Column(nullable = false)
    private String deviceName;

    @Column(nullable = false)
    private String deviceType;

    @Column(length = 1200)
    private String userAgent;

    private String ipAddress;

    @Column(nullable = false)
    private boolean active;

    private LocalDateTime createdAt;

    private LocalDateTime lastSeenAt;

    private LocalDateTime revokedAt;
}
