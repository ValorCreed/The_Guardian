package com.vault.theguardian.family;

import com.vault.theguardian.auth.AuthClient;
import com.vault.theguardian.auth.AuthenticatedUser;
import com.vault.theguardian.auth.InternalUserResponse;
import com.vault.theguardian.notification.NotificationClient;
import com.vault.theguardian.subscription.SubscriptionClient;
import com.vault.theguardian.vault.*;
import jakarta.transaction.Transactional;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

import java.time.LocalDateTime;
import java.util.*;
import java.util.function.Predicate;
import java.util.stream.Collectors;

@Service
@Transactional
public class FamilyService {
    private static final int FAMILY_MEMBER_LIMIT = 6;

    private final FamilyGroupRepository groupRepository;
    private final FamilyMemberRepository memberRepository;
    private final AuthClient authClient;
    private final SubscriptionClient subscriptionClient;
    private final NotificationClient notificationClient;
    private final VaultClient vaultClient;

    public FamilyService(
            FamilyGroupRepository groupRepository,
            FamilyMemberRepository memberRepository,
            AuthClient authClient,
            SubscriptionClient subscriptionClient,
            NotificationClient notificationClient,
            VaultClient vaultClient
    ) {
        this.groupRepository = groupRepository;
        this.memberRepository = memberRepository;
        this.authClient = authClient;
        this.subscriptionClient = subscriptionClient;
        this.notificationClient = notificationClient;
        this.vaultClient = vaultClient;
    }

    public FamilyOverviewResponse getOverview(AuthenticatedUser user) {
        FamilyGroup ownGroup = groupRepository.findByAdminId(user.id()).orElse(null);

        List<FamilyMember> ownMembers = ownGroup == null
                ? List.of()
                : memberRepository.findByGroupOrderByJoinedAtAsc(ownGroup);

        Map<Long, InternalUserResponse> memberUsers = usersById(
                ownMembers.stream().map(FamilyMember::getUserId).toList()
        );

        List<FamilyMemberResponse> members = ownMembers.stream()
                .map(member -> toMemberResponse(member, memberUsers.get(member.getUserId())))
                .toList();

        List<FamilyMember> memberships = memberRepository.findByUserId(user.id());
        List<Long> ownerIds = memberships.stream()
                .map(member -> member.getGroup().getAdminId())
                .distinct()
                .toList();

        Map<Long, InternalUserResponse> owners = usersById(ownerIds);
        List<SharedVaultOwnerResponse> sharedOwners = ownerIds.stream()
                .map(owners::get)
                .filter(Objects::nonNull)
                .map(owner -> new SharedVaultOwnerResponse(
                        owner.id(), safe(owner.fullName()), safe(owner.email())
                ))
                .toList();

        return new FamilyOverviewResponse(
                isFamilyPlan(user.id()),
                ownGroup != null,
                ownGroup == null ? null : ownGroup.getId(),
                FAMILY_MEMBER_LIMIT,
                members.size(),
                members,
                sharedOwners
        );
    }

    public ResponseEntity<Map<String, Object>> lookupPotentialMember(
            AuthenticatedUser admin,
            String email
    ) {
        String cleanEmail = normalizeEmail(email);

        if (cleanEmail.isBlank()) {
            return ResponseEntity.badRequest().body(Map.of(
                    "code", "MISSING_EMAIL",
                    "message", "Enter the email of the person you want to add."
            ));
        }

        if (!isFamilyPlan(admin.id())) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN).body(Map.of(
                    "code", "FAMILY_PLAN_REQUIRED",
                    "message", "Only Family plan users can add members."
            ));
        }

        if (cleanEmail.equalsIgnoreCase(admin.email())) {
            return ResponseEntity.badRequest().body(Map.of(
                    "code", "CANNOT_ADD_SELF",
                    "message", "You cannot add yourself to your own family group."
            ));
        }

        InternalUserResponse target = authClient.findByEmail(cleanEmail);
        if (target == null) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND).body(Map.of(
                    "code", "ACCOUNT_NOT_FOUND",
                    "message", "That email is not registered on The Guardian. Ask the person to create an account first, then add them again."
            ));
        }

        return ResponseEntity.ok(Map.of(
                "code", "ACCOUNT_FOUND",
                "exists", true,
                "userId", target.id(),
                "fullName", safe(target.fullName()),
                "email", safe(target.email())
        ));
    }

    @Transactional
    public FamilyMemberResponse addMember(
            AuthenticatedUser admin,
            AddFamilyMemberRequest request
    ) {
        String cleanEmail = normalizeEmail(request.email());

        if (cleanEmail.isBlank()) {
            throw badRequest("Enter the email of the person you want to add.");
        }

        if (!request.sharePasswords()
                && !request.shareCards()
                && !request.shareDocuments()
                && !request.shareNotes()) {
            throw badRequest("Choose at least one vault type to share.");
        }

        if (cleanEmail.equalsIgnoreCase(admin.email())) {
            throw badRequest("You cannot add yourself to your own family group.");
        }

        InternalUserResponse target = authClient.findByEmail(cleanEmail);
        if (target == null) {
            throw new ResponseStatusException(
                    HttpStatus.NOT_FOUND,
                    "That email is not registered on The Guardian. Ask the person to create an account first, then add them again."
            );
        }

        requireFamilyPlan(admin.id());

        FamilyGroup group = groupRepository.findByAdminId(admin.id())
                .orElseGet(() -> groupRepository.save(
                        FamilyGroup.builder()
                                .adminId(admin.id())
                                .createdAt(LocalDateTime.now())
                                .build()
                ));

        FamilyMember existing = memberRepository.findByGroupAndUserId(group, target.id())
                .orElse(null);

        if (existing != null) {
            applyPermissions(existing, request);
            FamilyMember saved = memberRepository.save(existing);
            notificationClient.notifyFamilyMemberAdded(admin.id(), target.email());
            return toMemberResponse(saved, target);
        }

        if (memberRepository.existsByUserId(target.id())) {
            throw badRequest("This user already belongs to another family group.");
        }

        if (memberRepository.countByGroup(group) >= FAMILY_MEMBER_LIMIT) {
            throw badRequest("Family member limit reached. You can add up to 6 members.");
        }

        FamilyMember saved = memberRepository.save(
                FamilyMember.builder()
                        .group(group)
                        .userId(target.id())
                        .joinedAt(LocalDateTime.now())
                        .sharePasswords(request.sharePasswords())
                        .shareCards(request.shareCards())
                        .shareDocuments(request.shareDocuments())
                        .shareNotes(request.shareNotes())
                        .build()
        );

        notificationClient.notifyFamilyMemberAdded(admin.id(), target.email());
        return toMemberResponse(saved, target);
    }

    @Transactional
    public void removeMember(AuthenticatedUser admin, Long membershipId) {
        FamilyGroup group = groupRepository.findByAdminId(admin.id())
                .orElseThrow(() -> new ResponseStatusException(
                        HttpStatus.NOT_FOUND, "You do not have a family group yet."
                ));

        FamilyMember member = memberRepository.findByIdAndGroup(membershipId, group)
                .orElseThrow(() -> new ResponseStatusException(
                        HttpStatus.NOT_FOUND, "Family member not found."
                ));

        InternalUserResponse target = authClient.findById(member.getUserId());
        memberRepository.delete(member);
        notificationClient.notifyFamilyMemberRemoved(
                admin.id(),
                target == null ? "A family member" : target.email()
        );
    }

    public SharedFamilyItemsResponse getSharedItems(AuthenticatedUser user) {
        return new SharedFamilyItemsResponse(
                getSharedPasswordItems(user),
                getSharedCardItems(user),
                getSharedDocumentItems(user),
                getSharedNoteItems(user)
        );
    }

    public List<SharedPasswordItemResponse> getSharedPasswordItems(AuthenticatedUser user) {
        return sharedItems(user.id(), Permission.PASSWORDS, "passwords").stream()
                .map(pair -> toPassword(pair.item(), pair.owner(), false))
                .toList();
    }

    public List<SharedCardItemResponse> getSharedCardItems(AuthenticatedUser user) {
        return sharedItems(user.id(), Permission.CARDS, "cards").stream()
                .map(pair -> toCard(pair.item(), pair.owner(), false))
                .toList();
    }

    public List<SharedDocumentItemResponse> getSharedDocumentItems(AuthenticatedUser user) {
        return sharedItems(user.id(), Permission.DOCUMENTS, "documents").stream()
                .map(pair -> toDocument(pair.item(), pair.owner()))
                .toList();
    }

    public List<SharedNoteItemResponse> getSharedNoteItems(AuthenticatedUser user) {
        return sharedItems(user.id(), Permission.NOTES, "notes").stream()
                .map(pair -> toNote(pair.item(), pair.owner(), false))
                .toList();
    }

    public SharedPasswordItemResponse getSharedPasswordItem(
            AuthenticatedUser user, Long itemId
    ) {
        ItemWithOwner pair = findSharedItem(user.id(), Permission.PASSWORDS, "passwords", itemId);
        return toPassword(pair.item(), pair.owner(), true);
    }

    public SharedCardItemResponse getSharedCardItem(
            AuthenticatedUser user, Long itemId
    ) {
        ItemWithOwner pair = findSharedItem(user.id(), Permission.CARDS, "cards", itemId);
        return toCard(pair.item(), pair.owner(), true);
    }

    public SharedDocumentItemResponse getSharedDocumentItem(
            AuthenticatedUser user, Long itemId
    ) {
        ItemWithOwner pair = findSharedItem(user.id(), Permission.DOCUMENTS, "documents", itemId);
        return toDocument(pair.item(), pair.owner());
    }

    public DownloadedDocument downloadSharedDocument(
            AuthenticatedUser user, Long itemId
    ) {
        ItemWithOwner pair = findSharedItem(user.id(), Permission.DOCUMENTS, "documents", itemId);
        return vaultClient.downloadDocument(pair.owner().id(), itemId);
    }

    public SharedNoteItemResponse getSharedNoteItem(
            AuthenticatedUser user, Long itemId
    ) {
        ItemWithOwner pair = findSharedItem(user.id(), Permission.NOTES, "notes", itemId);
        return toNote(pair.item(), pair.owner(), true);
    }

    public List<FamilyMemberPasswordRiskResponse> getFamilyMemberPasswordRisks(
            AuthenticatedUser admin
    ) {
        requireFamilyPlan(admin.id());

        FamilyGroup group = groupRepository.findByAdminId(admin.id()).orElse(null);
        if (group == null) return List.of();

        List<Long> memberIds = memberRepository.findByGroupOrderByJoinedAtAsc(group)
                .stream()
                .map(FamilyMember::getUserId)
                .toList();

        if (memberIds.isEmpty()) return List.of();

        Map<Long, InternalUserResponse> users = usersById(memberIds);

        return vaultClient.passwordRisks(memberIds).stream()
                .map(risk -> {
                    InternalUserResponse owner = users.get(risk.ownerId());
                    return new FamilyMemberPasswordRiskResponse(
                            risk.id(),
                            "FAMILY_MEMBER_PASSWORD_RISK",
                            safe(risk.title()),
                            safe(risk.usernameValue()),
                            safe(risk.website()),
                            risk.ownerId(),
                            owner == null ? "" : safe(owner.fullName()),
                            owner == null ? "" : safe(owner.email()),
                            risk.strengthScore(),
                            risk.strengthLabel(),
                            risk.oldPassword(),
                            risk.reusedPassword(),
                            risk.reusedCount(),
                            risk.riskTypes()
                    );
                })
                .toList();
    }

    private List<ItemWithOwner> sharedItems(
            Long viewerId,
            Permission permission,
            String itemType
    ) {
        List<Long> ownerIds = allowedOwnerIds(viewerId, permission);
        Map<Long, InternalUserResponse> owners = usersById(ownerIds);
        List<ItemWithOwner> result = new ArrayList<>();

        for (Long ownerId : ownerIds) {
            InternalUserResponse owner = owners.get(ownerId);
            if (owner == null) continue;

            for (InternalVaultItemResponse item : vaultClient.list(ownerId, itemType)) {
                result.add(new ItemWithOwner(item, owner));
            }
        }

        return result;
    }

    private ItemWithOwner findSharedItem(
            Long viewerId,
            Permission permission,
            String itemType,
            Long itemId
    ) {
        for (Long ownerId : allowedOwnerIds(viewerId, permission)) {
            InternalVaultItemResponse item = vaultClient.getOrNull(ownerId, itemType, itemId);
            if (item == null) continue;

            InternalUserResponse owner = authClient.requireById(ownerId);
            return new ItemWithOwner(item, owner);
        }

        throw new ResponseStatusException(
                HttpStatus.NOT_FOUND,
                "Shared " + itemType.substring(0, itemType.length() - 1) + " item not found."
        );
    }

    private List<Long> allowedOwnerIds(Long viewerId, Permission permission) {
        return memberRepository.findByUserId(viewerId).stream()
                .filter(member -> permission.allowed(member))
                .map(member -> member.getGroup().getAdminId())
                .distinct()
                .toList();
    }

    private boolean isFamilyPlan(Long userId) {
        var entitlements = subscriptionClient.getEntitlements(userId);
        return entitlements.active() && entitlements.canShareVault();
    }

    private void requireFamilyPlan(Long userId) {
        if (!isFamilyPlan(userId)) {
            throw new ResponseStatusException(
                    HttpStatus.FORBIDDEN,
                    "Only Family plan users can add members. Refresh your subscription or sign in again."
            );
        }
    }

    private void applyPermissions(FamilyMember member, AddFamilyMemberRequest request) {
        member.setSharePasswords(request.sharePasswords());
        member.setShareCards(request.shareCards());
        member.setShareDocuments(request.shareDocuments());
        member.setShareNotes(request.shareNotes());
    }

    private FamilyMemberResponse toMemberResponse(
            FamilyMember member,
            InternalUserResponse user
    ) {
        return new FamilyMemberResponse(
                member.getId(),
                member.getUserId(),
                user == null ? "" : safe(user.fullName()),
                user == null ? "" : safe(user.email()),
                member.getJoinedAt(),
                member.isSharePasswords(),
                member.isShareCards(),
                member.isShareDocuments(),
                member.isShareNotes()
        );
    }

    private SharedPasswordItemResponse toPassword(
            InternalVaultItemResponse item,
            InternalUserResponse owner,
            boolean detail
    ) {
        return new SharedPasswordItemResponse(
                item.id(), "PASSWORD", safe(item.title()), safe(item.usernameValue()),
                detail ? safe(item.password()) : "",
                safe(item.website()),
                detail ? safe(item.notes()) : "",
                owner.id(), safe(owner.fullName()), safe(owner.email())
        );
    }

    private SharedCardItemResponse toCard(
            InternalVaultItemResponse item,
            InternalUserResponse owner,
            boolean detail
    ) {
        return new SharedCardItemResponse(
                item.id(), "CARD", safe(item.cardName()),
                detail ? safe(item.cardNumber()) : "",
                detail ? safe(item.expiryDate()) : "",
                detail ? safe(item.cvv()) : "",
                detail ? safe(item.cardholderName()) : "",
                owner.id(), safe(owner.fullName()), safe(owner.email())
        );
    }

    private SharedDocumentItemResponse toDocument(
            InternalVaultItemResponse item,
            InternalUserResponse owner
    ) {
        return new SharedDocumentItemResponse(
                item.id(), "DOCUMENT", safe(item.documentName()),
                safe(item.documentType()), "", safe(item.documentNotes()),
                owner.id(), safe(owner.fullName()), safe(owner.email())
        );
    }

    private SharedNoteItemResponse toNote(
            InternalVaultItemResponse item,
            InternalUserResponse owner,
            boolean detail
    ) {
        return new SharedNoteItemResponse(
                item.id(), "NOTE", safe(item.title()), safe(item.category()),
                detail ? safe(item.content()) : "",
                Boolean.TRUE.equals(item.pinned()),
                item.createdAt(), item.updatedAt(),
                owner.id(), safe(owner.fullName()), safe(owner.email())
        );
    }

    private Map<Long, InternalUserResponse> usersById(Collection<Long> ids) {
        return authClient.findByIds(ids).stream()
                .collect(Collectors.toMap(
                        InternalUserResponse::id,
                        user -> user,
                        (first, ignored) -> first
                ));
    }

    private String normalizeEmail(String value) {
        return value == null ? "" : value.trim().toLowerCase();
    }

    private String safe(String value) {
        return value == null ? "" : value.trim();
    }

    private ResponseStatusException badRequest(String message) {
        return new ResponseStatusException(HttpStatus.BAD_REQUEST, message);
    }

    private enum Permission {
        PASSWORDS(FamilyMember::isSharePasswords),
        CARDS(FamilyMember::isShareCards),
        DOCUMENTS(FamilyMember::isShareDocuments),
        NOTES(FamilyMember::isShareNotes);

        private final Predicate<FamilyMember> predicate;

        Permission(Predicate<FamilyMember> predicate) {
            this.predicate = predicate;
        }

        boolean allowed(FamilyMember member) {
            return predicate.test(member);
        }
    }

    private record ItemWithOwner(
            InternalVaultItemResponse item,
            InternalUserResponse owner
    ) {}
}
