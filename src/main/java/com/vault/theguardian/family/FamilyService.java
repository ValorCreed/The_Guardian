package com.vault.theguardian.family;

import com.vault.theguardian.cards.CreditCardEntity;
import com.vault.theguardian.cards.CreditCardRepository;
import com.vault.theguardian.documents.DocumentRepository;
import com.vault.theguardian.documents.DocumentVault;
import com.vault.theguardian.notes.SecureNote;
import com.vault.theguardian.notes.SecureNoteRepository;
import com.vault.theguardian.notification.NotificationService;
import com.vault.theguardian.subscription.Subscription;
import com.vault.theguardian.subscription.SubscriptionPlan;
import com.vault.theguardian.subscription.SubscriptionRepository;
import com.vault.theguardian.user.User;
import com.vault.theguardian.user.UserRepository;
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
import java.time.LocalDateTime;
import java.util.Base64;
import java.util.List;
import java.util.function.Predicate;

@Service
public class FamilyService {
    private static final int FAMILY_MEMBER_LIMIT = 6;

    private final FamilyGroupRepository familyGroupRepository;
    private final FamilyMemberRepository familyMemberRepository;
    private final UserRepository userRepository;
    private final SubscriptionRepository subscriptionRepository;
    private final VaultItemRepository vaultItemRepository;
    private final CreditCardRepository creditCardRepository;
    private final DocumentRepository documentRepository;
    private final SecureNoteRepository secureNoteRepository;
    private final NotificationService notificationService;

    @Value("${VAULT_DOCUMENT_SECRET}")
    private String documentSecret;

    public FamilyService(FamilyGroupRepository familyGroupRepository,
                         FamilyMemberRepository familyMemberRepository,
                         UserRepository userRepository,
                         SubscriptionRepository subscriptionRepository,
                         VaultItemRepository vaultItemRepository,
                         CreditCardRepository creditCardRepository,
                         DocumentRepository documentRepository,
                         SecureNoteRepository secureNoteRepository,
                         NotificationService notificationService) {
        this.familyGroupRepository = familyGroupRepository;
        this.familyMemberRepository = familyMemberRepository;
        this.userRepository = userRepository;
        this.subscriptionRepository = subscriptionRepository;
        this.vaultItemRepository = vaultItemRepository;
        this.creditCardRepository = creditCardRepository;
        this.documentRepository = documentRepository;
        this.secureNoteRepository = secureNoteRepository;
        this.notificationService = notificationService;
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

    public FamilyMemberResponse addMember(User admin, AddFamilyMemberRequest request) {
        requireFamilyPlan(admin);

        String cleanEmail = request.email().trim().toLowerCase();

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

        User memberUser = userRepository.findByEmail(cleanEmail)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "No account found with that email."));

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
                .map(this::toSharedPasswordResponse)
                .toList();
    }

    public List<SharedCardItemResponse> getSharedCardItems(User user) {
        List<User> owners = sharedOwners(user, FamilyMember::isShareCards);
        if (owners.isEmpty()) return List.of();

        return creditCardRepository.findByUserIn(owners)
                .stream()
                .map(this::toSharedCardResponse)
                .toList();
    }

    public List<SharedDocumentItemResponse> getSharedDocumentItems(User user) {
        List<User> owners = sharedOwners(user, FamilyMember::isShareDocuments);
        if (owners.isEmpty()) return List.of();

        return documentRepository.findByUserIn(owners)
                .stream()
                .map(this::toSharedDocumentListResponse)
                .toList();
    }

    public List<SharedNoteItemResponse> getSharedNoteItems(User user) {
        List<User> owners = sharedOwners(user, FamilyMember::isShareNotes);
        if (owners.isEmpty()) return List.of();

        return secureNoteRepository.findByUserIn(owners)
                .stream()
                .map(this::toSharedNoteResponse)
                .toList();
    }

    public SharedPasswordItemResponse getSharedPasswordItem(User user, Long itemId) {
        VaultItem item = vaultItemRepository.findById(itemId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Shared password item not found."));

        boolean allowed = getSharedPasswordItems(user)
                .stream()
                .anyMatch(sharedItem -> sharedItem.id().equals(itemId));

        if (!allowed) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "You cannot access this shared password item.");
        }

        return toSharedPasswordResponse(item);
    }

    public SharedCardItemResponse getSharedCardItem(User user, Long itemId) {
        CreditCardEntity card = creditCardRepository.findById(itemId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Shared card not found."));

        boolean allowed = getSharedCardItems(user)
                .stream()
                .anyMatch(sharedCard -> sharedCard.id().equals(itemId));

        if (!allowed) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "You cannot access this shared card item.");
        }

        return toSharedCardResponse(card);
    }

    public SharedDocumentItemResponse getSharedDocumentItem(User user, Long itemId) {
        DocumentVault document = documentRepository.findById(itemId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Shared document not found."));

        boolean allowed = getSharedDocumentItems(user)
                .stream()
                .anyMatch(sharedDocument -> sharedDocument.id().equals(itemId));

        if (!allowed) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "You cannot access this shared document item.");
        }

        return toSharedDocumentDetailResponse(document);
    }

    public SharedNoteItemResponse getSharedNoteItem(User user, Long itemId) {
        SecureNote note = secureNoteRepository.findById(itemId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Shared secure note not found."));

        boolean allowed = getSharedNoteItems(user)
                .stream()
                .anyMatch(sharedNote -> sharedNote.id().equals(itemId));

        if (!allowed) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "You cannot access this shared secure note item.");
        }

        return toSharedNoteResponse(note);
    }

    public boolean isFamilyPlan(User user) {
        Subscription subscription = subscriptionRepository.findByUser(user)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Subscription not found."));

        return subscription.isActive() && subscription.getPlan() == SubscriptionPlan.FAMILY;
    }

    private void requireFamilyPlan(User user) {
        if (!isFamilyPlan(user)) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Family sharing is only available on the Family plan.");
        }
    }

    private List<User> sharedOwners(User user, Predicate<FamilyMember> permissionCheck) {
        return familyMemberRepository.findByUser(user)
                .stream()
                .filter(permissionCheck)
                .map(member -> member.getGroup().getAdmin())
                .toList();
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

    private SharedPasswordItemResponse toSharedPasswordResponse(VaultItem item) {
        User owner = item.getUser();

        return new SharedPasswordItemResponse(
                item.getId(),
                "PASSWORD",
                item.getTitle(),
                item.getUsernameValue(),
                item.getEncryptedPassword(),
                item.getWebsite(),
                item.getNotes(),
                owner.getId(),
                owner.getFullName(),
                owner.getEmail()
        );
    }

    private SharedCardItemResponse toSharedCardResponse(CreditCardEntity card) {
        User owner = card.getUser();

        return new SharedCardItemResponse(
                card.getId(),
                "CARD",
                card.getCardName(),
                card.getEncryptedCardNumber(),
                card.getEncryptedExpiryDate(),
                card.getEncryptedCvv(),
                card.getEncryptedCardholderName(),
                owner.getId(),
                owner.getFullName(),
                owner.getEmail()
        );
    }

    private SharedDocumentItemResponse toSharedDocumentListResponse(DocumentVault document) {
        User owner = document.getUser();

        return new SharedDocumentItemResponse(
                document.getId(),
                "DOCUMENT",
                document.getDocumentName(),
                document.getDocumentType(),
                "",
                document.getEncryptedNotes(),
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
                document.getDocumentName(),
                document.getDocumentType(),
                decryptTextIfPossible(document.getEncryptedFileUrl()),
                document.getEncryptedNotes(),
                owner.getId(),
                owner.getFullName(),
                owner.getEmail()
        );
    }

    private SharedNoteItemResponse toSharedNoteResponse(SecureNote note) {
        User owner = note.getUser();

        return new SharedNoteItemResponse(
                note.getId(),
                "NOTE",
                note.getTitle(),
                note.getCategory(),
                note.getEncryptedContent(),
                note.isPinned(),
                note.getCreatedAt(),
                note.getUpdatedAt(),
                owner.getId(),
                owner.getFullName(),
                owner.getEmail()
        );
    }

    private String decryptTextIfPossible(String storedText) {
        try {
            if (storedText == null || !storedText.contains(":")) {
                return storedText;
            }

            String[] parts = storedText.split(":", 2);
            byte[] iv = Base64.getDecoder().decode(parts[0]);
            byte[] encrypted = Base64.getDecoder().decode(parts[1]);

            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(Cipher.DECRYPT_MODE, getSecretKey(), new GCMParameterSpec(128, iv));

            byte[] decrypted = cipher.doFinal(encrypted);
            return new String(decrypted, StandardCharsets.UTF_8);
        } catch (Exception e) {
            return storedText;
        }
    }

    private SecretKeySpec getSecretKey() throws Exception {
        MessageDigest digest = MessageDigest.getInstance("SHA-256");
        byte[] key = digest.digest(documentSecret.getBytes(StandardCharsets.UTF_8));
        return new SecretKeySpec(key, "AES");
    }
}
