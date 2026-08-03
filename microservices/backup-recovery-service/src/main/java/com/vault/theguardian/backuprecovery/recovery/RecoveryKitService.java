package com.vault.theguardian.backuprecovery.recovery;

import com.vault.theguardian.backuprecovery.auth.AccountResetValidationResponse;
import com.vault.theguardian.backuprecovery.auth.AuthClient;
import com.vault.theguardian.backuprecovery.auth.AuthenticatedUser;
import com.vault.theguardian.backuprecovery.common.MessageResponse;
import com.vault.theguardian.backuprecovery.notification.NotificationClient;
import com.vault.theguardian.backuprecovery.vault.VaultClient;
import jakarta.transaction.Transactional;
import org.springframework.http.HttpStatus;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

import java.security.SecureRandom;
import java.time.LocalDateTime;
import java.util.List;
import java.util.UUID;

@Service
public class RecoveryKitService {
    private final RecoveryKitRepository recoveryKitRepository;
    private final PasswordEncoder passwordEncoder;
    private final AuthClient authClient;
    private final VaultClient vaultClient;
    private final NotificationClient notificationClient;
    private final SecureRandom secureRandom = new SecureRandom();

    public RecoveryKitService(
            RecoveryKitRepository recoveryKitRepository,
            PasswordEncoder passwordEncoder,
            AuthClient authClient,
            VaultClient vaultClient,
            NotificationClient notificationClient
    ) {
        this.recoveryKitRepository = recoveryKitRepository;
        this.passwordEncoder = passwordEncoder;
        this.authClient = authClient;
        this.vaultClient = vaultClient;
        this.notificationClient = notificationClient;
    }

    public RecoveryKitStatusResponse getStatus(AuthenticatedUser user) {
        Long userId = requireUserId(user);
        return recoveryKitRepository
                .findFirstByUserIdAndActiveTrueOrderByCreatedAtDesc(userId)
                .map(kit -> new RecoveryKitStatusResponse(
                        true,
                        kit.getRecoveryId(),
                        kit.getCreatedAt(),
                        kit.getLastUsedAt()
                ))
                .orElseGet(() -> new RecoveryKitStatusResponse(false, null, null, null));
    }

    @Transactional
    public RecoveryKitResponse generateRecoveryKit(
            AuthenticatedUser user,
            RecoveryKitGenerateRequest request
    ) {
        Long userId = requireUserId(user);

        if (!authClient.verifyPassword(userId, request.password())) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Incorrect password.");
        }

        revokeActiveRecoveryKits(userId);

        String recoveryId = "RK-"
                + UUID.randomUUID().toString().replace("-", "")
                .substring(0, 16).toUpperCase();
        String rawRecoveryKey = generateRecoveryKey();

        RecoveryKit saved = recoveryKitRepository.save(
                RecoveryKit.builder()
                        .userId(userId)
                        .recoveryId(recoveryId)
                        .recoveryKeyHash(passwordEncoder.encode(
                                normalizeRecoveryKey(rawRecoveryKey)
                        ))
                        .active(true)
                        .createdAt(LocalDateTime.now())
                        .lastUsedAt(null)
                        .revokedAt(null)
                        .build()
        );

        notificationClient.notifyRecoveryKitCreated(userId);

        return new RecoveryKitResponse(
                saved.getRecoveryId(),
                rawRecoveryKey,
                saved.getCreatedAt(),
                "Recovery kit generated. Save it somewhere safe. The recovery key will not be shown again."
        );
    }

    @Transactional
    public MessageResponse revokeRecoveryKit(AuthenticatedUser user) {
        Long userId = requireUserId(user);
        List<RecoveryKit> activeKits = recoveryKitRepository.findByUserIdAndActiveTrue(userId);

        if (activeKits.isEmpty()) {
            return new MessageResponse("No active recovery kit found.");
        }

        LocalDateTime now = LocalDateTime.now();
        for (RecoveryKit kit : activeKits) {
            kit.setActive(false);
            kit.setRevokedAt(now);
        }
        recoveryKitRepository.saveAll(activeKits);
        notificationClient.notifyRecoveryKitRevoked(userId);
        return new MessageResponse("Recovery kit revoked successfully.");
    }

    @Transactional
    public MessageResponse resetPasswordWithRecoveryKit(
            RecoveryPasswordResetRequest request
    ) {
        String cleanRecoveryId = request.recoveryId().trim().toUpperCase();
        String cleanRecoveryKey = normalizeRecoveryKey(request.recoveryKey());

        RecoveryKit kit = recoveryKitRepository
                .findByRecoveryIdAndActiveTrue(cleanRecoveryId)
                .orElseThrow(() -> new ResponseStatusException(
                        HttpStatus.UNAUTHORIZED,
                        "Invalid recovery details."
                ));

        if (!passwordEncoder.matches(cleanRecoveryKey, kit.getRecoveryKeyHash())) {
            throw new ResponseStatusException(
                    HttpStatus.UNAUTHORIZED,
                    "Invalid recovery details."
            );
        }

        LocalDateTime now = LocalDateTime.now();
        kit.setLastUsedAt(now);
        kit.setActive(false);
        kit.setRevokedAt(now);

        // Flush the local revocation before calling Auth Service. If the Auth call
        // fails, the surrounding transaction rolls this change back so the user can retry.
        recoveryKitRepository.saveAndFlush(kit);
        authClient.resetPassword(kit.getUserId(), request.newPassword(), "RECOVERY_KIT");
        notificationClient.notifyRecoveryKitUsed(kit.getUserId());

        return new MessageResponse(
                "Password reset successfully. Sign in and generate a new recovery kit."
        );
    }

    @Transactional
    public MessageResponse resetAccountAndEraseVault(AccountResetEraseRequest request) {
        String cleanEmail = request.email().trim().toLowerCase();
        String cleanResetCode = request.resetCode().trim();

        AccountResetValidationResponse validation = authClient.validateAccountReset(
                cleanEmail,
                cleanResetCode
        );
        Long userId = validation.userId();

        // Erase the old encrypted vault before the reset code is consumed.
        // If the final auth call fails, the still-valid reset code can safely be retried.
        vaultClient.deleteAll(userId);
        revokeActiveRecoveryKits(userId);
        authClient.completeAccountReset(
                cleanEmail,
                cleanResetCode,
                request.newPassword()
        );

        notificationClient.notifyAccountResetVaultErased(userId);
        return new MessageResponse(
                "Account reset successfully. Your old vault data was permanently erased. Sign in and set up a recovery kit."
        );
    }

    private void revokeActiveRecoveryKits(Long userId) {
        List<RecoveryKit> activeKits = recoveryKitRepository.findByUserIdAndActiveTrue(userId);
        if (activeKits.isEmpty()) return;

        LocalDateTime now = LocalDateTime.now();
        for (RecoveryKit activeKit : activeKits) {
            activeKit.setActive(false);
            activeKit.setRevokedAt(now);
        }
        recoveryKitRepository.saveAll(activeKits);
    }

    private Long requireUserId(AuthenticatedUser user) {
        if (user == null || user.userId() == null) {
            throw new ResponseStatusException(
                    HttpStatus.UNAUTHORIZED,
                    "Authenticated user could not be resolved."
            );
        }
        return user.userId();
    }

    private String generateRecoveryKey() {
        String alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
        StringBuilder value = new StringBuilder();
        for (int i = 0; i < 32; i++) {
            value.append(alphabet.charAt(secureRandom.nextInt(alphabet.length())));
        }
        return formatRecoveryKey(value.toString());
    }

    private String formatRecoveryKey(String value) {
        String clean = normalizeRecoveryKey(value);
        return clean.substring(0, 4) + "-"
                + clean.substring(4, 8) + "-"
                + clean.substring(8, 12) + "-"
                + clean.substring(12, 16) + "-"
                + clean.substring(16, 20) + "-"
                + clean.substring(20, 24) + "-"
                + clean.substring(24, 28) + "-"
                + clean.substring(28, 32);
    }

    private String normalizeRecoveryKey(String value) {
        if (value == null) return "";
        return value.trim()
                .toUpperCase()
                .replace("-", "")
                .replace(" ", "");
    }
}
