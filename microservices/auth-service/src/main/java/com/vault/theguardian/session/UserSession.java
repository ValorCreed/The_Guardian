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
                @Index(name = "idx_user_sessions_user_id", columnList = "user_id"),
                @Index(name = "idx_user_sessions_user_device_hash", columnList = "user_id, device_id_hash")
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

    /*
     * A SHA-256 hash of the app installation/device ID sent by the frontend.
     *
     * Important:
     * - This identifies the device/app installation.
     * - IP address should NOT be used as the device identity because users change networks.
     * - Store the hash, not the raw device ID.
     */
    @Column(name = "device_id_hash", length = 128)
    private String deviceIdHash;

    @Column(nullable = false)
    private String deviceName;

    @Column(nullable = false)
    private String deviceType;

    @Column(length = 1200)
    private String userAgent;

    /*
     * This is now only the latest known IP address.
     * It is not used to decide whether this is a new device.
     */
    private String ipAddress;

    @Column(nullable = false)
    private boolean active;

    private LocalDateTime createdAt;

    private LocalDateTime lastSeenAt;

    private LocalDateTime revokedAt;
}
