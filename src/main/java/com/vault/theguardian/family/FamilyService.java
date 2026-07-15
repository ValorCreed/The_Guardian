package com.vault.theguardian.family;

import com.vault.theguardian.cards.CreditCardEntity;
import com.vault.theguardian.cards.CreditCardRepository;
import com.vault.theguardian.documents.DocumentRepository;
import com.vault.theguardian.documents.DocumentService;
import com.vault.theguardian.documents.DocumentVault;
import com.vault.theguardian.notes.SecureNote;
import com.vault.theguardian.notes.SecureNoteRepository;
import com.vault.theguardian.notification.NotificationService;
import com.vault.theguardian.subscription.SubscriptionService;
import com.vault.theguardian.user.User;
import com.vault.theguardian.user.UserRepository;
import com.vault.theguardian.vault.VaultCryptoService;
import com.vault.theguardian.vault.VaultItem;
import com.vault.theguardian.vault.VaultItemRepository;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import java.time.LocalDateTime;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.function.Predicate;

@Service
public class FamilyService {
    private static final int FAMILY_MEMBER_LIMIT = 6;
    private static final int FAMILY_PASSWORD_OLD_DAYS = 180;

    private final FamilyGroupRepository familyGroupRepository;
    private final FamilyMemberRepository familyMemberRepository;
    private final UserRepository userRepository;
    private final SubscriptionService subscriptionService;
    private final VaultItemRepository vaultItemRepository;
    private final CreditCardRepository creditCardRepository;
    private final DocumentRepository documentRepository;
    private final DocumentService documentService;
    private final SecureNoteRepository secureNoteRepository;
    private final NotificationService notificationService;
    private final VaultCryptoService vaultCryptoService;

    public FamilyService(FamilyGroupRepository familyGroupRepository,
                         FamilyMemberRepository familyMemberRepository,
                         UserRepository userRepository,
                         SubscriptionService subscriptionService,
                         VaultItemRepository vaultItemRepository,
                         CreditCardRepository creditCardRepository,
                         DocumentRepository documentRepository,
                         DocumentService documentService,
                         SecureNoteRepository secureNoteRepository,
                         NotificationService notificationService,
                         VaultCryptoService vaultCryptoService) {
        this.familyGroupRepository = familyGroupRepository;
        this.familyMemberRepository = familyMemberRepository;
        this.userRepository = userRepository;
        this.subscriptionService = subscriptionService;
        this.vaultItemRepository = vaultItemRepository;
        this.creditCardRepository = creditCardRepository;
        this.documentRepository = documentRepository;
        this.documentService = documentService;
        this.secureNoteRepository = secureNoteRepository;
        this.notificationService = notificationService;
        this.vaultCryptoService = vaultCryptoService;
    }

    public FamilyOverviewResponse getOverview(User user) {
        boolean familyPlan = isFamilyPlan(user);
        FamilyGroup ownGroup = familyGroupRepository.findByAdmin(user).orElse(null);

        List<FamilyMemberResponse> members = ownGroup == null
                ? List.of()
                : familyMemberRepository.findByGroup(ownGroup)
                .stream()
                .map(this::toMemberResponse)
                .toList();

        List<SharedVaultOwnerResponse> sharedVaultOwners = familyMemberRepository.findByUser(user)
                .stream()
                .map(member -> member.getGroup().getAdmin())
                .map(admin -> new SharedVaultOwnerResponse(
                        admin.getId(),
                        admin.getFullName(),
                        admin.getEmail()
                ))
                .toList();

        return new FamilyOverviewResponse(
                familyPlan,
                ownGroup != null,
                ownGroup == null ? null : ownGroup.getId(),
                FAMILY_MEMBER_LIMIT,
                members.size(),
                members,
                sharedVaultOwners
        );
    }


    public ResponseEntity<Map<String, Object>> lookupPotentialMember(User admin, String email) {
        String cleanEmail = email == null ? "" : email.trim().toLowerCase();

        if (cleanEmail.isBlank()) {
            return ResponseEntity.badRequest().body(Map.of(
                    "code", "MISSING_EMAIL",
                    "message", "Enter the email of the person you want to add."
            ));
        }

        if (admin == null || admin.getEmail() == null) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body(Map.of(
                    "code", "UNAUTHENTICATED",
                    "message", "Please sign in again before adding a family member."
            ));
        }

        if (!isFamilyPlan(admin)) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN).body(Map.of(
                    "code", "FAMILY_PLAN_REQUIRED",
                    "message", "Only Family plan users can add members."
            ));
        }

        if (admin.getEmail().equalsIgnoreCase(cleanEmail)) {
            return ResponseEntity.badRequest().body(Map.of(
                    "code", "CANNOT_ADD_SELF",
                    "message", "You cannot add yourself to your own family group."
            ));
        }

        User memberUser = userRepository.findByEmailIgnoreCase(cleanEmail).orElse(null);
        if (memberUser == null) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND).body(Map.of(
                    "code", "ACCOUNT_NOT_FOUND",
                    "message", "That email is not registered on The Guardian. Ask the person to create an account first, then add them again."
            ));
        }

        return ResponseEntity.ok(Map.of(
                "code", "ACCOUNT_FOUND",
                "exists", true,
                "userId", memberUser.getId(),
                "fullName", safeText(memberUser.getFullName()),
                "email", safeText(memberUser.getEmail())
        ));
    }

    public FamilyMemberResponse addMember(User admin, AddFamilyMemberRequest request) {
        String cleanEmail = request.email() == null
                ? ""
                : request.email().trim().toLowerCase();

        if (cleanEmail.isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Enter the email of the person you want to add.");
        }

        if (!request.sharePasswords()
                && !request.shareCards()
                && !request.shareDocuments()
                && !request.shareNotes()) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST,
                    "Choose at least one vault type to share."
            );
        }

        if (admin.getEmail().equalsIgnoreCase(cleanEmail)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "You cannot add yourself to your own family group.");
        }

        /*
         * Check that the invited account exists before trying to create a family member.
         * This fixes the bad UX where an invalid email could result in a generic 403
         * or a demo/default member value instead of telling the user that the account
         * is not registered on The Guardian.
         */
        User memberUser = userRepository.findByEmailIgnoreCase(cleanEmail)
                .orElseThrow(() -> new ResponseStatusException(
                        HttpStatus.NOT_FOUND,
                        "That email is not registered on The Guardian. Ask the person to create an account first, then add them again."
                ));

        /*
         * Only after the target user exists do we enforce the Family-plan rule.
         * If the requester is not Family, they still cannot add anyone.
         */
        requireFamilyPlan(admin);

        FamilyGroup group = familyGroupRepository.findByAdmin(admin)
                .orElseGet(() -> familyGroupRepository.save(
                        FamilyGroup.builder()
                                .admin(admin)
                                .createdAt(LocalDateTime.now())
                                .build()
                ));

        FamilyMember existingMember = familyMemberRepository.findByGroup(group)
                .stream()
                .filter(member -> member.getUser().getId().equals(memberUser.getId()))
                .findFirst()
                .orElse(null);

        if (existingMember != null) {
            existingMember.setSharePasswords(request.sharePasswords());
            existingMember.setShareCards(request.shareCards());
            existingMember.setShareDocuments(request.shareDocuments());
            existingMember.setShareNotes(request.shareNotes());

            FamilyMember updated = familyMemberRepository.save(existingMember);
            notificationService.notifyFamilyMemberAdded(admin, memberUser.getEmail());
            return toMemberResponse(updated);
        }

        if (familyMemberRepository.existsByUser(memberUser)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "This user already belongs to another family group.");
        }

        if (familyMemberRepository.countByGroup(group) >= FAMILY_MEMBER_LIMIT) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Family member limit reached. You can add up to 6 members.");
        }

        FamilyMember saved = familyMemberRepository.save(
                FamilyMember.builder()
                        .group(group)
                        .user(memberUser)
                        .joinedAt(LocalDateTime.now())
                        .sharePasswords(request.sharePasswords())
                        .shareCards(request.shareCards())
                        .shareDocuments(request.shareDocuments())
                        .shareNotes(request.shareNotes())
                        .build()
        );

        notificationService.notifyFamilyMemberAdded(admin, memberUser.getEmail());
        return toMemberResponse(saved);
    }

    public void removeMember(User admin, Long membershipId) {
        FamilyGroup group = familyGroupRepository.findByAdmin(admin)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "You do not have a family group yet."));

        FamilyMember member = familyMemberRepository.findByIdAndGroup(membershipId, group)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Family member not found."));

        familyMemberRepository.delete(member);
        notificationService.notifyFamilyMemberRemoved(admin, member.getUser().getEmail());
    }

    public SharedFamilyItemsResponse getSharedItems(User user) {
        return new SharedFamilyItemsResponse(
                getSharedPasswordItems(user),
                getSharedCardItems(user),
                getSharedDocumentItems(user),
                getSharedNoteItems(user)
        );
    }

    public List<SharedPasswordItemResponse> getSharedPasswordItems(User user) {
        List<User> owners = sharedOwners(user, FamilyMember::isSharePasswords);
        if (owners.isEmpty()) return List.of();

        return vaultItemRepository.findByUserIn(owners)
                .stream()
                .map(this::toSharedPasswordSummaryResponse)
                .toList();
    }

    public List<SharedCardItemResponse> getSharedCardItems(User user) {
        List<User> owners = sharedOwners(user, FamilyMember::isShareCards);
        if (owners.isEmpty()) return List.of();

        return creditCardRepository.findByUserIn(owners)
                .stream()
                .map(this::toSharedCardSummaryResponse)
                .toList();
    }

    public List<SharedDocumentItemResponse> getSharedDocumentItems(User user) {
        List<User> owners = sharedOwners(user, FamilyMember::isShareDocuments);
        if (owners.isEmpty()) return List.of();

        return documentRepository.findByUserIn(owners)
                .stream()
                .map(this::toSharedDocumentSummaryResponse)
                .toList();
    }

    public List<SharedNoteItemResponse> getSharedNoteItems(User user) {
        List<User> owners = sharedOwners(user, FamilyMember::isShareNotes);
        if (owners.isEmpty()) return List.of();

        return secureNoteRepository.findByUserIn(owners)
                .stream()
                .map(this::toSharedNoteSummaryResponse)
                .toList();
    }

    public SharedPasswordItemResponse getSharedPasswordItem(User user, Long itemId) {
        VaultItem item = vaultItemRepository.findById(itemId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Shared password item not found."));

        if (!canAccessOwner(user, item.getUser(), FamilyMember::isSharePasswords)) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "You cannot access this shared password item.");
        }

        return toSharedPasswordDetailResponse(item);
    }

    public SharedCardItemResponse getSharedCardItem(User user, Long itemId) {
        CreditCardEntity card = creditCardRepository.findById(itemId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Shared card not found."));

        if (!canAccessOwner(user, card.getUser(), FamilyMember::isShareCards)) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "You cannot access this shared card item.");
        }

        return toSharedCardDetailResponse(card);
    }

    public SharedDocumentItemResponse getSharedDocumentItem(User user, Long itemId) {
        DocumentVault document = getAccessibleSharedDocument(user, itemId);
        return toSharedDocumentDetailResponse(document);
    }

    public byte[] getSharedDocumentBytes(User user, Long itemId) {
        DocumentVault document = getAccessibleSharedDocument(user, itemId);
        return documentService.getDocumentBytesForSharedAccess(document);
    }

    public String getSharedDocumentDownloadFileName(User user, Long itemId) {
        DocumentVault document = getAccessibleSharedDocument(user, itemId);
        return documentService.getDownloadFileNameForSharedAccess(document);
    }

    public String getSharedDocumentDownloadContentType(User user, Long itemId) {
        DocumentVault document = getAccessibleSharedDocument(user, itemId);
        return documentService.getDownloadContentTypeForSharedAccess(document);
    }

    private DocumentVault getAccessibleSharedDocument(User user, Long itemId) {
        DocumentVault document = documentRepository.findById(itemId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Shared document not found."));

        if (!canAccessOwner(user, document.getUser(), FamilyMember::isShareDocuments)) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "You cannot access this shared document item.");
        }

        return document;
    }

    public SharedNoteItemResponse getSharedNoteItem(User user, Long itemId) {
        SecureNote note = secureNoteRepository.findById(itemId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Shared secure note not found."));

        if (!canAccessOwner(user, note.getUser(), FamilyMember::isShareNotes)) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "You cannot access this shared secure note item.");
        }

        return toSharedNoteDetailResponse(note);
    }


    public List<FamilyMemberPasswordRiskResponse> getFamilyMemberPasswordRisks(User admin) {
        requireFamilyPlan(admin);

        FamilyGroup group = familyGroupRepository.findByAdmin(admin).orElse(null);
        if (group == null) return List.of();

        List<FamilyMember> members = familyMemberRepository.findByGroup(group);
        if (members.isEmpty()) return List.of();

        List<User> memberUsers = members.stream()
                .map(FamilyMember::getUser)
                .toList();

        if (memberUsers.isEmpty()) return List.of();

        List<VaultItem> items = vaultItemRepository.findByUserIn(memberUsers);
        if (items.isEmpty()) return List.of();

        Map<Long, String> plainPasswordByItemId = new HashMap<>();
        Map<String, Integer> passwordUsageCount = new HashMap<>();

        for (VaultItem item : items) {
            String plainPassword = safeDecryptVaultValue(item.getEncryptedPassword());
            plainPasswordByItemId.put(item.getId(), plainPassword);

            String normalizedPassword = normalizePasswordForReuse(plainPassword);
            if (!normalizedPassword.isBlank()) {
                passwordUsageCount.put(
                        normalizedPassword,
                        passwordUsageCount.getOrDefault(normalizedPassword, 0) + 1
                );
            }
        }

        return items.stream()
                .map(item -> toFamilyMemberPasswordRiskResponse(
                        item,
                        plainPasswordByItemId.getOrDefault(item.getId(), ""),
                        passwordUsageCount
                ))
                .filter(response -> response.riskTypes() != null && !response.riskTypes().isEmpty())
                .toList();
    }

    public boolean isFamilyPlan(User user) {
        return subscriptionService.isFamilyPlan(user);
    }

    private void requireFamilyPlan(User user) {
        if (!isFamilyPlan(user)) {
            throw new ResponseStatusException(
                    HttpStatus.FORBIDDEN,
                    "Only Family plan users can add members. Refresh your subscription or sign in again."
            );
        }
    }

    private List<User> sharedOwners(User user, Predicate<FamilyMember> permissionCheck) {
        return familyMemberRepository.findByUser(user)
                .stream()
                .filter(permissionCheck)
                .map(member -> member.getGroup().getAdmin())
                .toList();
    }

    private boolean canAccessOwner(User viewer, User owner, Predicate<FamilyMember> permissionCheck) {
        if (viewer == null || owner == null) return false;

        return familyMemberRepository.findByUser(viewer)
                .stream()
                .anyMatch(member ->
                        member.getGroup().getAdmin().getId().equals(owner.getId())
                                && permissionCheck.test(member)
                );
    }


    private FamilyMemberPasswordRiskResponse toFamilyMemberPasswordRiskResponse(
            VaultItem item,
            String plainPassword,
            Map<String, Integer> passwordUsageCount
    ) {
        User memberUser = item.getUser();
        String password = plainPassword == null ? "" : plainPassword;
        String normalizedPassword = normalizePasswordForReuse(password);
        int strengthScore = getPasswordStrengthScore(password);
        String strengthLabel = getPasswordStrengthLabel(strengthScore);
        int reusedCount = normalizedPassword.isBlank()
                ? 0
                : passwordUsageCount.getOrDefault(normalizedPassword, 0);
        boolean reusedPassword = reusedCount > 1;
        boolean oldPassword = isOldPassword(item);

        List<String> riskTypes = new ArrayList<>();

        if ("WEAK".equals(strengthLabel)) {
            riskTypes.add("WEAK");
        } else if ("MEDIUM".equals(strengthLabel)) {
            riskTypes.add("MEDIUM");
        }

        if (reusedPassword) {
            riskTypes.add("REUSED");
        }

        if (oldPassword) {
            riskTypes.add("OLD");
        }

        return new FamilyMemberPasswordRiskResponse(
                item.getId(),
                "FAMILY_MEMBER_PASSWORD_RISK",
                safeText(item.getTitle()),
                safeText(item.getUsernameValue()),
                safeText(item.getWebsite()),
                memberUser.getId(),
                safeText(memberUser.getFullName()),
                safeText(memberUser.getEmail()),
                strengthScore,
                strengthLabel,
                oldPassword,
                reusedPassword,
                reusedCount,
                riskTypes
        );
    }

    private String normalizePasswordForReuse(String password) {
        if (password == null) return "";
        return password.trim();
    }

    private boolean isOldPassword(VaultItem item) {
        LocalDateTime changedAt = item.getUpdatedAt() != null ? item.getUpdatedAt() : item.getCreatedAt();
        if (changedAt == null) return false;
        return ChronoUnit.DAYS.between(changedAt, LocalDateTime.now()) >= FAMILY_PASSWORD_OLD_DAYS;
    }

    private int getPasswordStrengthScore(String password) {
        if (password == null || password.isBlank()) return 0;

        int score = 0;

        if (password.length() >= 8) score += 15;
        if (password.length() >= 12) score += 20;
        if (password.length() >= 16) score += 10;
        if (password.matches(".*[a-z].*")) score += 10;
        if (password.matches(".*[A-Z].*")) score += 15;
        if (password.matches(".*[0-9].*")) score += 15;
        if (password.matches(".*[^A-Za-z0-9].*")) score += 15;

        String lower = password.toLowerCase();
        List<String> commonWords = List.of("password", "qwerty", "admin", "welcome", "guardian", "123456");

        if (commonWords.stream().anyMatch(lower::contains)) score -= 25;
        if (password.matches(".*(.)\\1{2,}.*")) score -= 10;
        if (password.matches("^(123|234|345|456|567|678|789|890).*")) score -= 10;

        return Math.max(0, Math.min(score, 100));
    }

    private String getPasswordStrengthLabel(int score) {
        if (score < 45) return "WEAK";
        if (score < 75) return "MEDIUM";
        return "STRONG";
    }

    private FamilyMemberResponse toMemberResponse(FamilyMember member) {
        User user = member.getUser();

        return new FamilyMemberResponse(
                member.getId(),
                user.getId(),
                user.getFullName(),
                user.getEmail(),
                member.getJoinedAt(),
                member.isSharePasswords(),
                member.isShareCards(),
                member.isShareDocuments(),
                member.isShareNotes()
        );
    }

    private SharedPasswordItemResponse toSharedPasswordSummaryResponse(VaultItem item) {
        User owner = item.getUser();

        return new SharedPasswordItemResponse(
                item.getId(),
                "PASSWORD",
                safeText(item.getTitle()),
                safeText(item.getUsernameValue()),
                "",
                safeText(item.getWebsite()),
                "",
                owner.getId(),
                owner.getFullName(),
                owner.getEmail()
        );
    }

    private SharedPasswordItemResponse toSharedPasswordDetailResponse(VaultItem item) {
        User owner = item.getUser();

        return new SharedPasswordItemResponse(
                item.getId(),
                "PASSWORD",
                safeText(item.getTitle()),
                safeText(item.getUsernameValue()),
                safeDecryptVaultValue(item.getEncryptedPassword()),
                safeText(item.getWebsite()),
                safeText(item.getNotes()),
                owner.getId(),
                owner.getFullName(),
                owner.getEmail()
        );
    }

    private SharedCardItemResponse toSharedCardSummaryResponse(CreditCardEntity card) {
        User owner = card.getUser();

        return new SharedCardItemResponse(
                card.getId(),
                "CARD",
                safeText(card.getCardName()),
                "",
                "",
                "",
                "",
                owner.getId(),
                owner.getFullName(),
                owner.getEmail()
        );
    }

    private SharedCardItemResponse toSharedCardDetailResponse(CreditCardEntity card) {
        User owner = card.getUser();

        return new SharedCardItemResponse(
                card.getId(),
                "CARD",
                safeText(card.getCardName()),
                safeDecryptVaultValue(card.getEncryptedCardNumber()),
                safeDecryptVaultValue(card.getEncryptedExpiryDate()),
                safeDecryptVaultValue(card.getEncryptedCvv()),
                safeDecryptVaultValue(card.getEncryptedCardholderName()),
                owner.getId(),
                owner.getFullName(),
                owner.getEmail()
        );
    }

    private SharedDocumentItemResponse toSharedDocumentSummaryResponse(DocumentVault document) {
        User owner = document.getUser();

        return new SharedDocumentItemResponse(
                document.getId(),
                "DOCUMENT",
                safeText(document.getDocumentName()),
                safeText(document.getDocumentType()),
                "",
                "",
                owner.getId(),
                owner.getFullName(),
                owner.getEmail()
        );
    }

    private SharedDocumentItemResponse toSharedDocumentDetailResponse(DocumentVault document) {
        User owner = document.getUser();

        return new SharedDocumentItemResponse(
                document.getId(),
                "DOCUMENT",
                safeText(document.getDocumentName()),
                safeText(document.getDocumentType()),
                "",
                "",
                owner.getId(),
                owner.getFullName(),
                owner.getEmail()
        );
    }

    private SharedNoteItemResponse toSharedNoteSummaryResponse(SecureNote note) {
        User owner = note.getUser();

        return new SharedNoteItemResponse(
                note.getId(),
                "NOTE",
                safeText(note.getTitle()),
                safeText(note.getCategory()),
                "",
                note.isPinned(),
                note.getCreatedAt(),
                note.getUpdatedAt(),
                owner.getId(),
                owner.getFullName(),
                owner.getEmail()
        );
    }

    private SharedNoteItemResponse toSharedNoteDetailResponse(SecureNote note) {
        User owner = note.getUser();

        return new SharedNoteItemResponse(
                note.getId(),
                "NOTE",
                safeText(note.getTitle()),
                safeText(note.getCategory()),
                safeDecryptVaultValue(note.getEncryptedContent()),
                note.isPinned(),
                note.getCreatedAt(),
                note.getUpdatedAt(),
                owner.getId(),
                owner.getFullName(),
                owner.getEmail()
        );
    }

    private String safeDecryptVaultValue(String storedValue) {
        if (storedValue == null || storedValue.isBlank()) return "";

        try {
            return cleanLegacyText(vaultCryptoService.decryptForResponse(storedValue));
        } catch (Exception ignored) {
            return "[Unable to decrypt. Ask the owner to update this item.]";
        }
    }

    private String safeText(String value) {
        return cleanLegacyText(value);
    }

    private String cleanLegacyText(String value) {
        if (value == null) return "";

        String cleaned = value.trim();

        for (int index = 0; index < 2; index++) {
            if (!cleaned.contains("%")) break;

            try {
                String decoded = URLDecoder.decode(cleaned, StandardCharsets.UTF_8);
                if (decoded.equals(cleaned)) break;
                cleaned = decoded.trim();
            } catch (Exception ignored) {
                break;
            }
        }

        if ((cleaned.startsWith("\"") && cleaned.endsWith("\""))
                || (cleaned.startsWith("'") && cleaned.endsWith("'"))) {
            cleaned = cleaned.substring(1, cleaned.length() - 1).trim();
        }

        return cleaned;
    }
}
