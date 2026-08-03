package com.vault.theguardian.duress;

import com.vault.theguardian.user.User;
import jakarta.persistence.*;
import lombok.*;

import java.time.LocalDateTime;

@Entity
@Table(name = "duress_profiles")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class DuressProfile {
    @Id
    @Column(name = "user_id")
    private Long userId;

    @OneToOne(fetch = FetchType.LAZY, optional = false)
    @MapsId
    @JoinColumn(name = "user_id")
    private User user;

    @Column(name = "duress_password_hash", nullable = false, columnDefinition = "TEXT")
    private String duressPasswordHash;

    @Column(nullable = false)
    private boolean enabled;

    @Column(name = "alert_enabled", nullable = false)
    private boolean alertEnabled;

    @Column(name = "alert_contact_user_id")
    private Long alertContactUserId;

    @Column(name = "alert_contact_email")
    private String alertContactEmail;

    @Column(name = "alert_contact_name")
    private String alertContactName;

    @Column(name = "alert_delay_minutes", nullable = false)
    private int alertDelayMinutes;

    @Column(name = "created_at", nullable = false)
    private LocalDateTime createdAt;

    @Column(name = "updated_at", nullable = false)
    private LocalDateTime updatedAt;
}
