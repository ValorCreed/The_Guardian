package com.vault.theguardian.incident;

import jakarta.persistence.*;
import lombok.*;

import java.time.LocalDateTime;

@Entity
@Table(
        name = "incident_recovery_tasks",
        indexes = {
                @Index(name = "idx_incident_tasks_incident_order", columnList = "incident_id, display_order"),
                @Index(name = "idx_incident_tasks_incident_status", columnList = "incident_id, status")
        },
        uniqueConstraints = {
                @UniqueConstraint(name = "uk_incident_task_code", columnNames = {"incident_id", "task_code"})
        }
)
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class IncidentRecoveryTask {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(optional = false, fetch = FetchType.LAZY)
    @JoinColumn(name = "incident_id", nullable = false)
    private SecurityIncident incident;

    @Column(name = "task_code", nullable = false, length = 96)
    private String taskCode;

    @Column(nullable = false, length = 255)
    private String title;

    @Column(nullable = false, columnDefinition = "TEXT")
    private String detail;

    @Column(name = "action_route", length = 255)
    private String actionRoute;

    @Column(nullable = false)
    private boolean required;

    @Column(nullable = false)
    private int priority;

    @Column(name = "display_order", nullable = false)
    private int displayOrder;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private IncidentTaskStatus status;

    @Column(name = "completed_at")
    private LocalDateTime completedAt;
}
