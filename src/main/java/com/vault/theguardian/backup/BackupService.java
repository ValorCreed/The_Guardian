package com.vault.theguardian.backup;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.vault.theguardian.cards.CreditCardEntity;
import com.vault.theguardian.cards.CreditCardRepository;
import com.vault.theguardian.documents.DocumentRepository;
import com.vault.theguardian.documents.DocumentVault;
import com.vault.theguardian.family.FamilyGroup;
import com.vault.theguardian.family.FamilyGroupRepository;
import com.vault.theguardian.family.FamilyMember;
import com.vault.theguardian.family.FamilyMemberRepository;
import com.vault.theguardian.integration.notification.NotificationClient;
import com.vault.theguardian.integration.subscription.SubscriptionClient;
import com.vault.theguardian.integration.subscription.SubscriptionSnapshot;
import com.vault.theguardian.user.User;
import com.vault.theguardian.vault.VaultItem;
import com.vault.theguardian.vault.VaultItemRepository;
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

    private final SubscriptionClient subscriptionService;
    private final VaultItemRepository vaultItemRepository;
    private final CreditCardRepository creditCardRepository;
    private final DocumentRepository documentRepository;
    private final FamilyGroupRepository familyGroupRepository;
    private final FamilyMemberRepository familyMemberRepository;
    private final ObjectMapper objectMapper;
    private final NotificationClient notificationClient;

    @Value("${vault.backup.secret:change-this-backup-secret}")
    private String backupSecret;

    public BackupService(SubscriptionClient subscriptionService,
                         VaultItemRepository vaultItemRepository,
                         CreditCardRepository creditCardRepository,
                         DocumentRepository documentRepository,
                         FamilyGroupRepository familyGroupRepository,
                         FamilyMemberRepository familyMemberRepository,
                         NotificationClient notificationClient) {
        this.subscriptionService = subscriptionService;
        this.vaultItemRepository = vaultItemRepository;
        this.creditCardRepository = creditCardRepository;
        this.documentRepository = documentRepository;
        this.familyGroupRepository = familyGroupRepository;
        this.familyMemberRepository = familyMemberRepository;
        this.notificationClient = notificationClient;
        this.objectMapper = new ObjectMapper().findAndRegisterModules();
    }

    public BackupStatusResponse getBackupStatus(User user) {
        SubscriptionSnapshot subscription = subscriptionService.getMySubscription(user);
        boolean allowed = subscriptionService.canUseBackup(user);
        Counts counts = getCounts(user);

        String message = allowed
                ? "Backup is available on your current plan."
                : "Backup is only available on the Premium and Family plans.";

        return new BackupStatusResponse(
                allowed,
                subscription.plan(),
                message,
                subscription.expiresAt(),
                counts.passwordCount(),
                counts.cardCount(),
                counts.documentCount(),
                counts.familyMemberCount(),
                counts.totalItemCount()
        );
    }

    public BackupResponse createBackup(User user) {
        requireBackupAccess(user);
        requireStrongBackupSecret();

        try {
            SubscriptionSnapshot subscription = subscriptionService.getMySubscription(user);
            LocalDateTime now = LocalDateTime.now();

            List<VaultItem> passwords = vaultItemRepository.findByUser(user);
            List<CreditCardEntity> cards = creditCardRepository.findByUser(user);
            List<DocumentVault> documents = documentRepository.findByUser(user);
            List<FamilyMember> familyMembers = getFamilyMembersForBackup(user);

            Map<String, Object> backup = new LinkedHashMap<>();
            backup.put("backupVersion", BACKUP_VERSION);
            backup.put("appName", "The Guardian");
            backup.put("createdAt", now.toString());
            backup.put("owner", ownerBackup(user));
            backup.put("subscription", subscriptionBackup(subscription));
            backup.put("summary", Map.of(
                    "passwordCount", passwords.size(),
                    "cardCount", cards.size(),
                    "documentCount", documents.size(),
                    "familyMemberCount", familyMembers.size(),
                    "totalItemCount", passwords.size() + cards.size() + documents.size() + familyMembers.size()
            ));
            backup.put("passwords", passwords.stream().map(this::passwordBackup).toList());
            backup.put("cards", cards.stream().map(this::cardBackup).toList());
            backup.put("documents", documents.stream().map(this::documentBackup).toList());
            backup.put("family", familyBackup(user, familyMembers));

            String json = objectMapper.writeValueAsString(backup);
            String checksum = sha256(json);
            String encryptedBackup = encryptText(json);

            String fileName = "theguardian-backup-" + now.format(DateTimeFormatter.ofPattern("yyyyMMdd-HHmmss")) + ".tgvault";
            int totalItemCount = passwords.size() + cards.size() + documents.size() + familyMembers.size();

            notificationClient.notifyBackupCreated(user, totalItemCount);

            return new BackupResponse(
                    fileName,
                    now,
                    encryptedBackup,
                    encryptedBackup.getBytes(StandardCharsets.UTF_8).length,
                    checksum,
                    "Encrypted backup created successfully.",
                    passwords.size(),
                    cards.size(),
                    documents.size(),
                    familyMembers.size(),
                    totalItemCount
            );
        } catch (ResponseStatusException e) {
            throw e;
        } catch (Exception e) {
            throw new ResponseStatusException(HttpStatus.INTERNAL_SERVER_ERROR, "Could not create backup.");
        }
    }

    public BackupRestoreResponse restoreBackup(User user, BackupRestoreRequest request) {
        requireBackupAccess(user);
        requireStrongBackupSecret();

        boolean replaceExisting = Boolean.TRUE.equals(request.replaceExisting());
        LocalDateTime restoredAt = LocalDateTime.now();

        try {
            String decryptedJson = decryptText(request.encryptedBackup());
            Map<String, Object> backup = objectMapper.readValue(
                    decryptedJson,
                    new TypeReference<Map<String, Object>>() {}
            );

            Object versionValue = backup.get("backupVersion");
            int version = toInt(versionValue, 0);

            if (version <= 0 || version > BACKUP_VERSION) {
                throw new ResponseStatusException(
                        HttpStatus.BAD_REQUEST,
                        "This backup version is not supported."
                );
            }

            if (replaceExisting) {
                vaultItemRepository.deleteAll(vaultItemRepository.findByUser(user));
                creditCardRepository.deleteAll(creditCardRepository.findByUser(user));
                documentRepository.deleteAll(documentRepository.findByUser(user));
            }

            List<Map<String, Object>> passwords = listOfMaps(backup.get("passwords"));
            List<Map<String, Object>> cards = listOfMaps(backup.get("cards"));
            List<Map<String, Object>> documents = listOfMaps(backup.get("documents"));

            int restoredPasswords = restorePasswords(user, passwords);
            int restoredCards = restoreCards(user, cards);
            int restoredDocuments = restoreDocuments(user, documents);
            int total = restoredPasswords + restoredCards + restoredDocuments;

            notificationClient.notifyBackupRestored(user, total, replaceExisting);

            String message = replaceExisting
                    ? "Backup restored. Existing passwords, cards, and documents were replaced."
                    : "Backup restored. Items were added to your current vault.";

            return new BackupRestoreResponse(
                    message,
                    restoredAt,
                    replaceExisting,
                    restoredPasswords,
                    restoredCards,
                    restoredDocuments,
                    total
            );
        } catch (ResponseStatusException e) {
            throw e;
        } catch (Exception e) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST,
                    "Could not restore backup. Make sure the selected file is a valid The Guardian backup."
            );
        }
    }

    private int restorePasswords(User user, List<Map<String, Object>> items) {
        int restored = 0;

        for (Map<String, Object> item : items) {
            String title = stringValue(item.get("title"));
            String password = stringValue(item.get("encryptedPassword"));

            if (title.isBlank() || password.isBlank()) {
                continue;
            }

            VaultItem vaultItem = VaultItem.builder()
                    .title(title)
                    .usernameValue(stringValue(item.get("usernameValue")))
                    .encryptedPassword(password)
                    .website(stringValue(item.get("website")))
                    .notes(stringValue(item.get("notes")))
                    .createdAt(parseDateOrNow(stringValue(item.get("createdAt"))))
                    .user(user)
                    .build();

            vaultItemRepository.save(vaultItem);
            restored++;
        }

        return restored;
    }

    private int restoreCards(User user, List<Map<String, Object>> items) {
        int restored = 0;

        for (Map<String, Object> item : items) {
            String cardName = stringValue(item.get("cardName"));
            String cardNumber = stringValue(item.get("encryptedCardNumber"));
            String expiry = stringValue(item.get("encryptedExpiryDate"));
            String cvv = stringValue(item.get("encryptedCvv"));

            if (cardName.isBlank() || cardNumber.isBlank() || expiry.isBlank() || cvv.isBlank()) {
                continue;
            }

            CreditCardEntity card = CreditCardEntity.builder()
                    .user(user)
                    .cardName(cardName)
                    .encryptedCardNumber(cardNumber)
                    .encryptedExpiryDate(expiry)
                    .encryptedCvv(cvv)
                    .encryptedCardholderName(stringValue(item.get("encryptedCardholderName")))
                    .createdAt(parseDateOrNow(stringValue(item.get("createdAt"))))
                    .build();

            creditCardRepository.save(card);
            restored++;
        }

        return restored;
    }

    private int restoreDocuments(User user, List<Map<String, Object>> items) {
        int restored = 0;

        for (Map<String, Object> item : items) {
            String documentName = stringValue(item.get("documentName"));
            String encryptedFileUrl = stringValue(item.get("encryptedFileUrl"));

            if (documentName.isBlank() || encryptedFileUrl.isBlank()) {
                continue;
            }

            DocumentVault document = DocumentVault.builder()
                    .user(user)
                    .documentName(documentName)
                    .documentType(stringValue(item.get("documentType")))
                    .encryptedFileUrl(encryptedFileUrl)
                    .encryptedNotes(stringValue(item.get("encryptedNotes")))
                    .createdAt(parseDateOrNow(stringValue(item.get("createdAt"))))
                    .build();

            documentRepository.save(document);
            restored++;
        }

        return restored;
    }

    private void requireBackupAccess(User user) {
        if (!subscriptionService.canUseBackup(user)) {
            throw new ResponseStatusException(
                    HttpStatus.FORBIDDEN,
                    "Backup is only available on the Premium and Family plans."
            );
        }
    }

    private void requireStrongBackupSecret() {
        if (isWeakBackupSecret()) {
            throw new ResponseStatusException(
                    HttpStatus.INTERNAL_SERVER_ERROR,
                    "Backup secret is not configured. Set vault.backup.secret to a strong value."
            );
        }
    }

    private Counts getCounts(User user) {
        int passwordCount = vaultItemRepository.findByUser(user).size();
        int cardCount = creditCardRepository.findByUser(user).size();
        int documentCount = documentRepository.findByUser(user).size();
        int familyMemberCount = getFamilyMembersForBackup(user).size();

        return new Counts(
                passwordCount,
                cardCount,
                documentCount,
                familyMemberCount,
                passwordCount + cardCount + documentCount + familyMemberCount
        );
    }

    private List<FamilyMember> getFamilyMembersForBackup(User user) {
        FamilyGroup adminGroup = familyGroupRepository.findByAdmin(user).orElse(null);

        if (adminGroup != null) {
            return familyMemberRepository.findByGroup(adminGroup);
        }

        return familyMemberRepository.findByUser(user);
    }

    private Map<String, Object> ownerBackup(User user) {
        Map<String, Object> owner = new LinkedHashMap<>();
        owner.put("id", user.getId());
        owner.put("fullName", safe(user.getFullName()));
        owner.put("email", safe(user.getEmail()));
        return owner;
    }

    private Map<String, Object> subscriptionBackup(SubscriptionSnapshot subscription) {
        Map<String, Object> data = new LinkedHashMap<>();
        data.put("plan", subscription.plan());
        data.put("active", subscription.active());
        data.put("startedAt", subscription.startedAt() == null ? "" : subscription.startedAt().toString());
        data.put("expiresAt", subscription.expiresAt() == null ? "" : subscription.expiresAt().toString());
        return data;
    }

    private Map<String, Object> familyBackup(User user, List<FamilyMember> familyMembers) {
        FamilyGroup adminGroup = familyGroupRepository.findByAdmin(user).orElse(null);
        List<FamilyMember> userMemberships = familyMemberRepository.findByUser(user);
        FamilyGroup memberGroup = userMemberships.isEmpty() ? null : userMemberships.get(0).getGroup();

        Map<String, Object> family = new LinkedHashMap<>();
        family.put("isFamilyAdmin", adminGroup != null);
        family.put("adminGroupId", adminGroup == null ? "" : String.valueOf(adminGroup.getId()));
        family.put("memberGroupId", memberGroup == null ? "" : String.valueOf(memberGroup.getId()));
        family.put("members", familyMembers.stream().map(this::familyMemberBackup).toList());
        return family;
    }

    private Map<String, Object> passwordBackup(VaultItem item) {
        Map<String, Object> data = new LinkedHashMap<>();
        data.put("id", item.getId());
        data.put("title", safe(item.getTitle()));
        data.put("usernameValue", safe(item.getUsernameValue()));
        data.put("encryptedPassword", safe(item.getEncryptedPassword()));
        data.put("website", safe(item.getWebsite()));
        data.put("notes", safe(item.getNotes()));
        data.put("createdAt", item.getCreatedAt() == null ? "" : item.getCreatedAt().toString());
        return data;
    }

    private Map<String, Object> cardBackup(CreditCardEntity card) {
        Map<String, Object> data = new LinkedHashMap<>();
        data.put("id", card.getId());
        data.put("cardName", safe(card.getCardName()));
        data.put("encryptedCardNumber", safe(card.getEncryptedCardNumber()));
        data.put("encryptedExpiryDate", safe(card.getEncryptedExpiryDate()));
        data.put("encryptedCvv", safe(card.getEncryptedCvv()));
        data.put("encryptedCardholderName", safe(card.getEncryptedCardholderName()));
        data.put("createdAt", card.getCreatedAt() == null ? "" : card.getCreatedAt().toString());
        return data;
    }

    private Map<String, Object> documentBackup(DocumentVault document) {
        Map<String, Object> data = new LinkedHashMap<>();
        data.put("id", document.getId());
        data.put("documentName", safe(document.getDocumentName()));
        data.put("documentType", safe(document.getDocumentType()));
        data.put("encryptedFileUrl", safe(document.getEncryptedFileUrl()));
        data.put("encryptedNotes", safe(document.getEncryptedNotes()));
        data.put("createdAt", document.getCreatedAt() == null ? "" : document.getCreatedAt().toString());
        return data;
    }

    private Map<String, Object> familyMemberBackup(FamilyMember member) {
        User memberUser = member.getUser();
        FamilyGroup group = member.getGroup();

        Map<String, Object> data = new LinkedHashMap<>();
        data.put("membershipId", member.getId());
        data.put("groupId", group == null ? "" : String.valueOf(group.getId()));
        data.put("userId", memberUser.getId());
        data.put("fullName", safe(memberUser.getFullName()));
        data.put("email", safe(memberUser.getEmail()));
        data.put("joinedAt", member.getJoinedAt() == null ? "" : member.getJoinedAt().toString());
        data.put("sharePasswords", member.isSharePasswords());
        data.put("shareCards", member.isShareCards());
        data.put("shareDocuments", member.isShareDocuments());
        return data;
    }

    private String encryptText(String plainText) throws Exception {
        byte[] iv = new byte[12];
        new SecureRandom().nextBytes(iv);

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
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid backup file format.");
        }

        byte[] iv = Base64.getDecoder().decode(stringValue(wrapper.get("iv")));
        byte[] encrypted = Base64.getDecoder().decode(stringValue(wrapper.get("data")));

        Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
        cipher.init(Cipher.DECRYPT_MODE, getSecretKey(), new GCMParameterSpec(128, iv));

        byte[] decrypted = cipher.doFinal(encrypted);
        return new String(decrypted, StandardCharsets.UTF_8);
    }

    private SecretKeySpec getSecretKey() throws Exception {
        MessageDigest digest = MessageDigest.getInstance("SHA-256");
        byte[] key = digest.digest(backupSecret.getBytes(StandardCharsets.UTF_8));
        return new SecretKeySpec(key, "AES");
    }

    private String sha256(String value) throws Exception {
        MessageDigest digest = MessageDigest.getInstance("SHA-256");
        byte[] hash = digest.digest(value.getBytes(StandardCharsets.UTF_8));
        return Base64.getEncoder().encodeToString(hash);
    }

    private boolean isWeakBackupSecret() {
        return backupSecret == null
                || backupSecret.isBlank()
                || "change-this-backup-secret".equals(backupSecret)
                || backupSecret.length() < 32;
    }

    private LocalDateTime parseDateOrNow(String value) {
        if (value == null || value.isBlank()) {
            return LocalDateTime.now();
        }

        try {
            return LocalDateTime.parse(value);
        } catch (Exception e) {
            return LocalDateTime.now();
        }
    }

    private String stringValue(Object value) {
        return value == null ? "" : String.valueOf(value);
    }

    private int toInt(Object value, int fallback) {
        if (value == null) return fallback;
        if (value instanceof Number number) return number.intValue();

        try {
            return Integer.parseInt(String.valueOf(value));
        } catch (Exception e) {
            return fallback;
        }
    }

    @SuppressWarnings("unchecked")
    private List<Map<String, Object>> listOfMaps(Object value) {
        if (value instanceof List<?> list) {
            return list.stream()
                    .filter(item -> item instanceof Map)
                    .map(item -> (Map<String, Object>) item)
                    .toList();
        }

        return List.of();
    }

    private String safe(String value) {
        return value == null ? "" : value;
    }

    private record Counts(
            int passwordCount,
            int cardCount,
            int documentCount,
            int familyMemberCount,
            int totalItemCount
    ) {}
}
