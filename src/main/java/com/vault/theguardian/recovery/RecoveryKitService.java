package com.vault.theguardian.recovery;

import com.vault.theguardian.auth.MessageResponse;
import com.vault.theguardian.cards.CreditCardRepository;
import com.vault.theguardian.documents.DocumentRepository;
import com.vault.theguardian.notes.SecureNoteRepository;
import com.vault.theguardian.notification.NotificationService;
import com.vault.theguardian.session.UserSession;
import com.vault.theguardian.session.UserSessionRepository;
import com.vault.theguardian.user.User;
import com.vault.theguardian.user.UserRepository;
import com.vault.theguardian.vault.VaultItemRepository;
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
    private final UserRepository userRepository;
    private final PasswordEncoder passwordEncoder;
    private final NotificationService notificationService;
    private final VaultItemRepository vaultItemRepository;
    private final CreditCardRepository creditCardRepository;
    private final DocumentRepository documentRepository;
    private final SecureNoteRepository secureNoteRepository;
    private final UserSessionRepository userSessionRepository;
    private final SecureRandom secureRandom = new SecureRandom();

    public RecoveryKitService(
            RecoveryKitRepository recoveryKitRepository,
            UserRepository userRepository,
            PasswordEncoder passwordEncoder,
            NotificationService notificationService,
            VaultItemRepository vaultItemRepository,
            CreditCardRepository creditCardRepository,
            DocumentRepository documentRepository,
            SecureNoteRepository secureNoteRepository,
            UserSessionRepository userSessionRepository
    ) {
        this.recoveryKitRepository = recoveryKitRepository;
        this.userRepository = userRepository;
        this.passwordEncoder = passwordEncoder;
        this.notificationService = notificationService;
        this.vaultItemRepository = vaultItemRepository;
        this.creditCardRepository = creditCardRepository;
        this.documentRepository = documentRepository;
        this.secureNoteRepository = secureNoteRepository;
        this.userSessionRepository = userSessionRepository;
    }

    public RecoveryKitStatusResponse getStatus(User user) {
        return recoveryKitRepository.findFirstByUserAndActiveTrueOrderByCreatedAtDesc(user)
                .map(kit -> new RecoveryKitStatusResponse(
                        true,
                        kit.getRecoveryId(),
                        kit.getCreatedAt(),
                        kit.getLastUsedAt()
                ))
                .orElseGet(() -> new RecoveryKitStatusResponse(false, null, null, null));
    }

    @Transactional
    public RecoveryKitResponse generateRecoveryKit(User user, RecoveryKitGenerateRequest request) {
        if (request == null || request.password() == null || request.password().isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Enter your account password to generate a recovery kit.");
        }

        if (!passwordEncoder.matches(request.password(), user.getPasswordHash())) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Incorrect password.");
        }

        revokeActiveRecoveryKits(user);

        String recoveryId = "RK-" + UUID.randomUUID().toString().replace("-", "").substring(0, 16).toUpperCase();
        String rawRecoveryKey = generateRecoveryKey();

        RecoveryKit kit = RecoveryKit.builder()
                .user(user)
                .recoveryId(recoveryId)
                .recoveryKeyHash(passwordEncoder.encode(normalizeRecoveryKey(rawRecoveryKey)))
                .active(true)
                .createdAt(LocalDateTime.now())
                .lastUsedAt(null)
                .revokedAt(null)
                .build();

        RecoveryKit saved = recoveryKitRepository.save(kit);
        notificationService.notifyRecoveryKitCreated(user);

        return new RecoveryKitResponse(
                saved.getRecoveryId(),
                rawRecoveryKey,
                saved.getCreatedAt(),
                "Recovery kit generated. Save it somewhere safe. The recovery key will not be shown again."
        );
    }

    @Transactional
    public MessageResponse revokeRecoveryKit(User user) {
        List<RecoveryKit> activeKits = recoveryKitRepository.findByUserAndActiveTrue(user);

        if (activeKits.isEmpty()) {
            return new MessageResponse("No active recovery kit found.");
        }

        LocalDateTime now = LocalDateTime.now();
        for (RecoveryKit kit : activeKits) {
            kit.setActive(false);
            kit.setRevokedAt(now);
        }

        recoveryKitRepository.saveAll(activeKits);
        notificationService.notifyRecoveryKitRevoked(user);

        return new MessageResponse("Recovery kit revoked successfully.");
    }

    @Transactional
    public MessageResponse resetPasswordWithRecoveryKit(RecoveryPasswordResetRequest request) {
        String cleanRecoveryId = request.recoveryId().trim().toUpperCase();
        String cleanRecoveryKey = normalizeRecoveryKey(request.recoveryKey());

        RecoveryKit kit = recoveryKitRepository.findByRecoveryIdAndActiveTrue(cleanRecoveryId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Invalid recovery details."));

        if (kit.getUser() == null) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Invalid recovery details.");
        }

        if (!passwordEncoder.matches(cleanRecoveryKey, kit.getRecoveryKeyHash())) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Invalid recovery details.");
        }

        User user = kit.getUser();
        LocalDateTime now = LocalDateTime.now();

        user.setPasswordHash(passwordEncoder.encode(request.newPassword()));
        user.setPasswordResetCode(null);
        user.setPasswordResetCodeExpiresAt(null);
        user.setTwoFactorCode(null);
        user.setTwoFactorCodeExpiresAt(null);
        userRepository.save(user);

        kit.setLastUsedAt(now);
        kit.setActive(false);
        kit.setRevokedAt(now);
        recoveryKitRepository.save(kit);

        revokeActiveSessions(user, now);
        notificationService.notifyRecoveryKitUsed(user);

        return new MessageResponse("Password reset successfully. Sign in and generate a new recovery kit.");
    }

    @Transactional
    public MessageResponse resetAccountAndEraseVault(AccountResetEraseRequest request) {
        String cleanEmail = request.email().trim().toLowerCase();
        String cleanResetCode = request.resetCode().trim();

        User user = userRepository.findByEmail(cleanEmail)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Invalid email or reset code."));

        if (!user.isEmailVerified()) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Please verify your email before resetting your account.");
        }

        if (user.getPasswordResetCode() == null || user.getPasswordResetCodeExpiresAt() == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "No password reset code found. Request a reset code first.");
        }

        if (LocalDateTime.now().isAfter(user.getPasswordResetCodeExpiresAt())) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Password reset code has expired. Request a new code.");
        }

        if (!user.getPasswordResetCode().equals(cleanResetCode)) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Invalid email or reset code.");
        }

        LocalDateTime now = LocalDateTime.now();

        deleteVaultData(user);
        revokeActiveRecoveryKits(user);
        revokeActiveSessions(user, now);

        user.setPasswordHash(passwordEncoder.encode(request.newPassword()));
        user.setPasswordResetCode(null);
        user.setPasswordResetCodeExpiresAt(null);
        user.setTwoFactorCode(null);
        user.setTwoFactorCodeExpiresAt(null);
        userRepository.save(user);

        notificationService.notifyAccountResetVaultErased(user);

        return new MessageResponse("Account reset successfully. Your old vault data was permanently erased. Sign in and set up a recovery kit.");
    }

    private void deleteVaultData(User user) {
        vaultItemRepository.deleteAll(vaultItemRepository.findByUser(user));
        creditCardRepository.deleteAll(creditCardRepository.findByUser(user));
        documentRepository.deleteAll(documentRepository.findByUser(user));
        secureNoteRepository.deleteAll(secureNoteRepository.findByUserOrderByPinnedDescUpdatedAtDesc(user));
    }

    private void revokeActiveSessions(User user, LocalDateTime now) {
        List<UserSession> activeSessions = userSessionRepository.findByUserAndActiveTrue(user);

        for (UserSession session : activeSessions) {
            session.setActive(false);
            session.setRevokedAt(now);
        }

        if (!activeSessions.isEmpty()) {
            userSessionRepository.saveAll(activeSessions);
            userSessionRepository.flush();
        }
    }

    private void revokeActiveRecoveryKits(User user) {
        List<RecoveryKit> activeKits = recoveryKitRepository.findByUserAndActiveTrue(user);
        LocalDateTime now = LocalDateTime.now();

        for (RecoveryKit activeKit : activeKits) {
            activeKit.setActive(false);
            activeKit.setRevokedAt(now);
        }

        if (!activeKits.isEmpty()) {
            recoveryKitRepository.saveAll(activeKits);
        }
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
        return clean.substring(0, 4) + "-" +
                clean.substring(4, 8) + "-" +
                clean.substring(8, 12) + "-" +
                clean.substring(12, 16) + "-" +
                clean.substring(16, 20) + "-" +
                clean.substring(20, 24) + "-" +
                clean.substring(24, 28) + "-" +
                clean.substring(28, 32);
    }

    private String normalizeRecoveryKey(String value) {
        if (value == null) return "";
        return value.trim()
                .toUpperCase()
                .replace("-", "")
                .replace(" ", "");
    }
}
