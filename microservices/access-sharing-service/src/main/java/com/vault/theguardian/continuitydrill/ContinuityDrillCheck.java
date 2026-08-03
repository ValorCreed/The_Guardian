package com.vault.theguardian.continuitydrill;

import jakarta.persistence.*;
import lombok.*;

@Entity
@Table(
        name = "continuity_drill_checks",
        uniqueConstraints = @UniqueConstraint(
                name = "uk_continuity_drill_check",
                columnNames = {"drill_id", "check_code"}
        )
)
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class ContinuityDrillCheck {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "drill_id", nullable = false)
    private ContinuityDrill drill;

    @Column(name = "check_code", nullable = false, length = 50)
    private String checkCode;

    @Column(nullable = false)
    private String title;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 10)
    private ContinuityCheckStatus status;

    @Column(nullable = false, columnDefinition = "TEXT")
    private String detail;

    @Column(name = "action_route", length = 255)
    private String actionRoute;

    @Column(nullable = false)
    private int weight;

    @Column(name = "earned_points", nullable = false)
    private int earnedPoints;

    @Column(name = "display_order", nullable = false)
    private int displayOrder;
}
