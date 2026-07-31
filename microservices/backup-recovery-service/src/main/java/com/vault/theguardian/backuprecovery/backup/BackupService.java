package com.vault.theguardian.backuprecovery.backup;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.vault.theguardian.backuprecovery.access.AccessSharingClient;
import com.vault.theguardian.backuprecovery.access.FamilyBackupMember;
import com.vault.theguardian.backuprecovery.access.FamilyBackupResponse;
import com.vault.theguardian.backuprecovery.auth.AuthClient;
import com.vault.theguardian.backuprecovery.auth.AuthenticatedUser;
import com.vault.theguardian.backuprecovery.auth.InternalUserResponse;
import com.vault.theguardian.backuprecovery.notification.NotificationClient;
import com.vault.theguardian.backuprecovery.subscription.SubscriptionClient;
import com.vault.theguardian.backuprecovery.subscription.SubscriptionEntitlements;
import com.vault.theguardian.backuprecovery.subscription.SubscriptionSnapshot;
import com.vault.theguardian.backuprecovery.vault.*;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

import javax.crypto.Cipher;
import javax.crypto.spec.GCMParameterSpec;
import javax.crypto.spec.SecretKeySpec;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.Base64;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

@Service
public class BackupService {
    private static final int BACKUP_VERSION = 2;

    private final SubscriptionClient subscriptionClient;
    private final VaultClient vaultClient;
    private final AccessSharingClient accessSharingClient;
    private final AuthClient authClient;
    private final NotificationClient notificationClient;
    private final ObjectMapper objectMapper;
    private final SecureRandom secureRandom = new SecureRandom();

    @Value("${vault.backup.secret:change-this-backup-secret}")
    private String backupSecret;

    public BackupService(
            SubscriptionClient subscriptionClient,
            VaultClient vaultClient,
            AccessSharingClient accessSharingClient,
            AuthClient authClient,
            NotificationClient notificationClient,
            ObjectMapper objectMapper
    ) {
        this.subscriptionClient = subscriptionClient;
        this.vaultClient = vaultClient;
        this.accessSharingClient = accessSharingClient;
        this.authClient = authClient;
        this.notificationClient = notificationClient;
        this.objectMapper = objectMapper.copy().findAndRegisterModules();
    }

    public BackupStatusResponse getBackupStatus(AuthenticatedUser user) {
        requireAuthenticatedUser(user);

        SubscriptionSnapshot subscription = subscriptionClient.getSubscription(user.userId());
        SubscriptionEntitlements entitlements = subscriptionClient.getEntitlements(user.userId());
        VaultBackupResponse vault = vaultClient.exportBackup(user.userId());
        FamilyBackupResponse family = accessSharingClient.exportFamily(user.userId());

        boolean allowed = entitlements.canUseBackup();
        int total = vault.passwordCount()
                + vault.cardCount()
                + vault.documentCount()
                + family.familyMemberCount();

        String message = allowed
                ? "Backup is available on your current plan."
                : "Backup is only available on the Premium and Family plans.";

        return new BackupStatusResponse(
                allowed,
                safePlan(subscription.plan()),
                message,
                subscription.expiresAt(),
                vault.passwordCount(),
                vault.cardCount(),
                vault.documentCount(),
                family.familyMemberCount(),
                total
        );
    }

    public BackupResponse createBackup(AuthenticatedUser user) {
        requireAuthenticatedUser(user);
        requireBackupAccess(user.userId());
        requireStrongBackupSecret();

        try {
            InternalUserResponse owner = authClient.requireUser(user.userId());
            SubscriptionSnapshot subscription = subscriptionClient.getSubscription(user.userId());
            VaultBackupResponse vault = vaultClient.exportBackup(user.userId());
            FamilyBackupResponse family = accessSharingClient.exportFamily(user.userId());
            LocalDateTime now = LocalDateTime.now();

            int totalItemCount = vault.passwordCount()
                    + vault.cardCount()
                    + vault.documentCount()
                    + family.familyMemberCount();

            Map<String, Object> backup = new LinkedHashMap<>();
            backup.put("backupVersion", BACKUP_VERSION);
            backup.put("appName", "The Guardian");
            backup.put("createdAt", now.toString());
            backup.put("owner", ownerBackup(owner));
            backup.put("subscription", subscriptionBackup(subscription));
            backup.put("summary", Map.of(
                    "passwordCount", vault.passwordCount(),
                    "cardCount", vault.cardCount(),
                    "documentCount", vault.documentCount(),
                    "familyMemberCount", family.familyMemberCount(),
                    "totalItemCount", totalItemCount
            ));
            backup.put("passwords", vault.passwords());
            backup.put("cards", vault.cards());
            backup.put("documents", vault.documents());
            backup.put("family", familyBackup(family));

            String json = objectMapper.writeValueAsString(backup);
            String checksum = sha256(json);
            String encryptedBackup = encryptText(json);
            String fileName = "theguardian-backup-"
                    + now.format(DateTimeFormatter.ofPattern("yyyyMMdd-HHmmss"))
                    + ".tgvault";

            notificationClient.notifyBackupCreated(user.userId(), totalItemCount);

            return new BackupResponse(
                    fileName,
                    now,
                    encryptedBackup,
                    encryptedBackup.getBytes(StandardCharsets.UTF_8).length,
                    checksum,
                    "Encrypted backup created successfully.",
                    vault.passwordCount(),
                    vault.cardCount(),
                    vault.documentCount(),
                    family.familyMemberCount(),
                    totalItemCount
            );
        } catch (ResponseStatusException exception) {
            throw exception;
        } catch (Exception exception) {
            throw new ResponseStatusException(
                    HttpStatus.INTERNAL_SERVER_ERROR,
                    "Could not create backup.",
                    exception
            );
        }
    }

    public BackupRestoreResponse restoreBackup(
            AuthenticatedUser user,
            BackupRestoreRequest request
    ) {
        requireAuthenticatedUser(user);
        requireBackupAccess(user.userId());
        requireStrongBackupSecret();

        boolean replaceExisting = Boolean.TRUE.equals(request.replaceExisting());
        LocalDateTime restoredAt = LocalDateTime.now();

        try {
            String decryptedJson = decryptText(request.encryptedBackup());
            Map<String, Object> backup = objectMapper.readValue(
                    decryptedJson,
                    new TypeReference<Map<String, Object>>() {}
            );

            int version = toInt(backup.get("backupVersion"), 0);
            if (version <= 0 || version > BACKUP_VERSION) {
                throw new ResponseStatusException(
                        HttpStatus.BAD_REQUEST,
                        "This backup version is not supported."
                );
            }

            List<BackupPasswordItem> passwords = convertList(
                    backup.get("passwords"), BackupPasswordItem.class
            );
            List<BackupCardItem> cards = convertList(
                    backup.get("cards"), BackupCardItem.class
            );
            List<BackupDocumentItem> documents = convertList(
                    backup.get("documents"), BackupDocumentItem.class
            );

            VaultRestoreResponse restored = vaultClient.restore(
                    user.userId(),
                    new VaultRestoreRequest(replaceExisting, passwords, cards, documents)
            );

            notificationClient.notifyBackupRestored(
                    user.userId(), restored.totalRestoredCount(), replaceExisting
            );

            String message = replaceExisting
                    ? "Backup restored. Existing passwords, cards, and documents were replaced."
                    : "Backup restored. Items were added to your current vault.";

            return new BackupRestoreResponse(
                    message,
                    restoredAt,
                    replaceExisting,
                    restored.restoredPasswordCount(),
                    restored.restoredCardCount(),
                    restored.restoredDocumentCount(),
                    restored.totalRestoredCount()
            );
        } catch (ResponseStatusException exception) {
            throw exception;
        } catch (Exception exception) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST,
                    "Could not restore backup. Make sure the selected file is a valid The Guardian backup.",
                    exception
            );
        }
    }

    private void requireBackupAccess(Long userId) {
        if (!subscriptionClient.getEntitlements(userId).canUseBackup()) {
            throw new ResponseStatusException(
                    HttpStatus.FORBIDDEN,
                    "Backup is only available on the Premium and Family plans."
            );
        }
    }

    private void requireStrongBackupSecret() {
        if (backupSecret == null
                || backupSecret.isBlank()
                || "change-this-backup-secret".equals(backupSecret)
                || backupSecret.length() < 32) {
            throw new ResponseStatusException(
                    HttpStatus.INTERNAL_SERVER_ERROR,
                    "Backup secret is not configured. Set BACKUP_SECRET to the existing strong backup value."
            );
        }
    }

    private void requireAuthenticatedUser(AuthenticatedUser user) {
        if (user == null || user.userId() == null) {
            throw new ResponseStatusException(
                    HttpStatus.UNAUTHORIZED,
                    "Authenticated user could not be resolved."
            );
        }
    }

    private Map<String, Object> ownerBackup(InternalUserResponse owner) {
        Map<String, Object> data = new LinkedHashMap<>();
        data.put("id", owner.id());
        data.put("fullName", safe(owner.fullName()));
        data.put("email", safe(owner.email()));
        return data;
    }

    private Map<String, Object> subscriptionBackup(SubscriptionSnapshot subscription) {
        Map<String, Object> data = new LinkedHashMap<>();
        data.put("plan", safePlan(subscription.plan()));
        data.put("active", subscription.active());
        data.put("startedAt", subscription.startedAt() == null
                ? "" : subscription.startedAt().toString());
        data.put("expiresAt", subscription.expiresAt() == null
                ? "" : subscription.expiresAt().toString());
        return data;
    }

    private Map<String, Object> familyBackup(FamilyBackupResponse family) {
        Map<String, Object> data = new LinkedHashMap<>();
        data.put("isFamilyAdmin", family.familyAdmin());
        data.put("adminGroupId", family.adminGroupId() == null
                ? "" : String.valueOf(family.adminGroupId()));
        data.put("memberGroupId", family.memberGroupId() == null
                ? "" : String.valueOf(family.memberGroupId()));
        data.put("members", family.members() == null ? List.of() : family.members());
        return data;
    }

    private String encryptText(String plainText) throws Exception {
        byte[] iv = new byte[12];
        secureRandom.nextBytes(iv);

        Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
        cipher.init(Cipher.ENCRYPT_MODE, getSecretKey(), new GCMParameterSpec(128, iv));
        byte[] encrypted = cipher.doFinal(plainText.getBytes(StandardCharsets.UTF_8));

        Map<String, Object> wrapper = new LinkedHashMap<>();
        wrapper.put("format", "theguardian.encrypted-backup");
        wrapper.put("version", BACKUP_VERSION);
        wrapper.put("algorithm", "AES/GCM/NoPadding");
        wrapper.put("iv", Base64.getEncoder().encodeToString(iv));
        wrapper.put("data", Base64.getEncoder().encodeToString(encrypted));
        return objectMapper.writeValueAsString(wrapper);
    }

    private String decryptText(String encryptedBackup) throws Exception {
        Map<String, Object> wrapper = objectMapper.readValue(
                encryptedBackup,
                new TypeReference<Map<String, Object>>() {}
        );

        String format = stringValue(wrapper.get("format"));
        String algorithm = stringValue(wrapper.get("algorithm"));
        if (!"theguardian.encrypted-backup".equals(format)
                || !"AES/GCM/NoPadding".equals(algorithm)) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST,
                    "Invalid backup file format."
            );
        }

        byte[] iv = Base64.getDecoder().decode(stringValue(wrapper.get("iv")));
        byte[] encrypted = Base64.getDecoder().decode(stringValue(wrapper.get("data")));

        Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
        cipher.init(Cipher.DECRYPT_MODE, getSecretKey(), new GCMParameterSpec(128, iv));
        return new String(cipher.doFinal(encrypted), StandardCharsets.UTF_8);
    }

    private SecretKeySpec getSecretKey() throws Exception {
        MessageDigest digest = MessageDigest.getInstance("SHA-256");
        return new SecretKeySpec(
                digest.digest(backupSecret.getBytes(StandardCharsets.UTF_8)),
                "AES"
        );
    }

    private String sha256(String value) throws Exception {
        MessageDigest digest = MessageDigest.getInstance("SHA-256");
        return Base64.getEncoder().encodeToString(
                digest.digest(value.getBytes(StandardCharsets.UTF_8))
        );
    }

    private <T> List<T> convertList(Object value, Class<T> type) {
        if (!(value instanceof List<?> list)) return List.of();
        return list.stream()
                .filter(item -> item instanceof Map<?, ?>)
                .map(item -> objectMapper.convertValue(item, type))
                .toList();
    }

    private int toInt(Object value, int fallback) {
        if (value == null) return fallback;
        if (value instanceof Number number) return number.intValue();
        try {
            return Integer.parseInt(String.valueOf(value));
        } catch (Exception ignored) {
            return fallback;
        }
    }

    private String stringValue(Object value) {
        return value == null ? "" : String.valueOf(value);
    }

    private String safe(String value) {
        return value == null ? "" : value;
    }

    private String safePlan(String value) {
        return value == null || value.isBlank() ? "FREE" : value;
    }
}
