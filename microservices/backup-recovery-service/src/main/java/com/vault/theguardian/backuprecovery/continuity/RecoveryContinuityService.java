package com.vault.theguardian.backuprecovery.continuity;

import com.vault.theguardian.backuprecovery.recovery.RecoveryKitRepository;
import com.vault.theguardian.backuprecovery.recoverycircle.RecoveryCircle;
import com.vault.theguardian.backuprecovery.recoverycircle.RecoveryCircleMemberRepository;
import com.vault.theguardian.backuprecovery.recoverycircle.RecoveryCircleRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

@Service
public class RecoveryContinuityService {
    private final RecoveryCircleRepository circleRepository;
    private final RecoveryCircleMemberRepository memberRepository;
    private final RecoveryKitRepository recoveryKitRepository;

    public RecoveryContinuityService(
            RecoveryCircleRepository circleRepository,
            RecoveryCircleMemberRepository memberRepository,
            RecoveryKitRepository recoveryKitRepository
    ) {
        this.circleRepository = circleRepository;
        this.memberRepository = memberRepository;
        this.recoveryKitRepository = recoveryKitRepository;
    }

    @Transactional(readOnly = true)
    public RecoveryContinuitySnapshotResponse snapshot(Long ownerId) {
        RecoveryCircle circle = circleRepository.findByOwnerId(ownerId).orElse(null);
        List<RecoveryContinuityMemberResponse> members = circle == null
                ? List.of()
                : memberRepository.findByCircleIdOrderByCreatedAtAsc(circle.getId()).stream()
                .map(member -> new RecoveryContinuityMemberResponse(
                        member.getMemberUserId(),
                        member.getMemberName(),
                        member.getMemberEmail()
                ))
                .toList();

        return new RecoveryContinuitySnapshotResponse(
                circle != null,
                circle != null && circle.isActive(),
                circle == null ? 0 : circle.getApprovalThreshold(),
                recoveryKitRepository.findFirstByUserIdAndActiveTrueOrderByCreatedAtDesc(ownerId)
                        .isPresent(),
                members
        );
    }
}
