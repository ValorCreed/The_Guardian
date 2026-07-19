package com.vault.theguardian.emergency;

import jakarta.persistence.*;
import lombok.*;

import java.time.LocalDateTime;

@Entity
@Table(name = "emergency_access_requests")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class EmergencyAccessRequest {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "contact_id", nullable = false)
    private EmergencyContact contact;

    @Column(name = "owner_id", nullable = false)
    private Long ownerId;

    @Column(name = "requester_id", nullable = false)
    private Long requesterId;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private EmergencyAccessStatus status;

    @Column(columnDefinition = "TEXT")
    private String message;

    @Column(name = "requested_at", nullable = false)
    private LocalDateTime requestedAt;

    @Column(name = "available_at", nullable = false)
    private LocalDateTime availableAt;

    @Column(name = "approved_at")
    private LocalDateTime approvedAt;

    @Column(name = "denied_at")
    private LocalDateTime deniedAt;

    @Column(name = "released_at")
    private LocalDateTime releasedAt;
}
