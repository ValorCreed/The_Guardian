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
    private final FamilySharedItemRepository sharedItemRepository;
    private final AuthClient authClient;
    private final SubscriptionClient subscriptionClient;
    private final NotificationClient notificationClient;
    private final VaultClient vaultClient;

    public FamilyService(
            FamilyGroupRepository groupRepository,
            FamilyMemberRepository memberRepository,
            FamilySharedItemRepository sharedItemRepository,
            AuthClient authClient,
            SubscriptionClient subscriptionClient,
            NotificationClient notificationClient,
            VaultClient vaultClient
    ) {
        this.groupRepository = groupRepository;
        this.memberRepository = memberRepository;
        this.sharedItemRepository = sharedItemRepository;
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

        SelectionPlan selections = resolveSelections(admin.id(), request);
        if (selections.isEmpty()) {
            throw badRequest("Select at least one specific vault item to share.");
        }

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
            applyPermissions(existing, selections);
            FamilyMember saved = memberRepository.save(existing);
            replaceSelections(saved, selections);
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
                        .sharePasswords(!selections.passwordIds().isEmpty())
                        .shareCards(!selections.cardIds().isEmpty())
                        .shareDocuments(!selections.documentIds().isEmpty())
                        .shareNotes(!selections.noteIds().isEmpty())
                        .build()
        );

        replaceSelections(saved, selections);
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
        String normalizedType = normalizeItemType(itemType);
        List<FamilyMember> memberships = memberRepository.findByUserId(viewerId).stream()
                .filter(permission::allowed)
                .toList();

        Map<Long, InternalUserResponse> owners = usersById(
                memberships.stream().map(member -> member.getGroup().getAdminId()).toList()
        );
        List<ItemWithOwner> result = new ArrayList<>();

        for (FamilyMember membership : memberships) {
            Long ownerId = membership.getGroup().getAdminId();
            InternalUserResponse owner = owners.get(ownerId);
            if (owner == null) continue;

            Set<Long> selectedIds = sharedItemRepository
                    .findByMembership_IdAndItemType(membership.getId(), normalizedType)
                    .stream()
                    .map(FamilySharedItem::getItemId)
                    .collect(Collectors.toSet());

            if (selectedIds.isEmpty()) continue;

            for (InternalVaultItemResponse item : vaultClient.list(ownerId, itemType)) {
                if (selectedIds.contains(item.id())) {
                    result.add(new ItemWithOwner(item, owner));
                }
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
        String normalizedType = normalizeItemType(itemType);

        for (FamilyMember membership : memberRepository.findByUserId(viewerId)) {
            if (!permission.allowed(membership)) continue;

            boolean selected = sharedItemRepository
                    .existsByMembership_IdAndItemTypeAndItemId(
                            membership.getId(), normalizedType, itemId
                    );
            if (!selected) continue;

            Long ownerId = membership.getGroup().getAdminId();
            InternalVaultItemResponse item = vaultClient.getOrNull(ownerId, itemType, itemId);
            if (item == null) continue;

            InternalUserResponse owner = authClient.requireById(ownerId);
            return new ItemWithOwner(item, owner);
        }

        throw new ResponseStatusException(
                HttpStatus.NOT_FOUND,
                "Shared " + normalizedType.toLowerCase() + " item not found."
        );
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

    private void applyPermissions(FamilyMember member, SelectionPlan selections) {
        member.setSharePasswords(!selections.passwordIds().isEmpty());
        member.setShareCards(!selections.cardIds().isEmpty());
        member.setShareDocuments(!selections.documentIds().isEmpty());
        member.setShareNotes(!selections.noteIds().isEmpty());
    }

    private SelectionPlan resolveSelections(Long ownerId, AddFamilyMemberRequest request) {
        return new SelectionPlan(
                resolveSelectedIds(ownerId, "passwords", request.sharePasswords(), request.passwordItemIds()),
                resolveSelectedIds(ownerId, "cards", request.shareCards(), request.cardItemIds()),
                resolveSelectedIds(ownerId, "documents", request.shareDocuments(), request.documentItemIds()),
                resolveSelectedIds(ownerId, "notes", request.shareNotes(), request.noteItemIds())
        );
    }

    private List<Long> resolveSelectedIds(
            Long ownerId,
            String itemType,
            boolean enabled,
            List<Long> requestedIds
    ) {
        if (!enabled) return List.of();

        Set<Long> ownedIds = vaultClient.list(ownerId, itemType).stream()
                .map(InternalVaultItemResponse::id)
                .filter(Objects::nonNull)
                .collect(Collectors.toCollection(LinkedHashSet::new));

        List<Long> selectedIds = requestedIds == null
                ? List.copyOf(ownedIds)
                : requestedIds.stream()
                .filter(Objects::nonNull)
                .distinct()
                .toList();

        if (selectedIds.isEmpty()) {
            throw badRequest("Select at least one " + normalizeItemType(itemType).toLowerCase() + " item to share.");
        }

        if (!ownedIds.containsAll(selectedIds)) {
            throw badRequest("One or more selected " + normalizeItemType(itemType).toLowerCase() + " items are invalid.");
        }

        return selectedIds;
    }

    private void replaceSelections(FamilyMember membership, SelectionPlan selections) {
        sharedItemRepository.deleteByMembership_Id(membership.getId());

        List<FamilySharedItem> items = new ArrayList<>();
        addSelections(items, membership, "PASSWORD", selections.passwordIds());
        addSelections(items, membership, "CARD", selections.cardIds());
        addSelections(items, membership, "DOCUMENT", selections.documentIds());
        addSelections(items, membership, "NOTE", selections.noteIds());

        if (!items.isEmpty()) {
            sharedItemRepository.saveAll(items);
        }
    }

    private void addSelections(
            List<FamilySharedItem> target,
            FamilyMember membership,
            String itemType,
            Collection<Long> itemIds
    ) {
        LocalDateTime now = LocalDateTime.now();
        for (Long itemId : itemIds) {
            target.add(FamilySharedItem.builder()
                    .membership(membership)
                    .itemType(itemType)
                    .itemId(itemId)
                    .createdAt(now)
                    .build());
        }
    }

    private String normalizeItemType(String value) {
        String type = value == null ? "" : value.trim().toUpperCase();
        return switch (type) {
            case "PASSWORD", "PASSWORDS" -> "PASSWORD";
            case "CARD", "CARDS" -> "CARD";
            case "DOCUMENT", "DOCUMENTS" -> "DOCUMENT";
            case "NOTE", "NOTES" -> "NOTE";
            default -> throw badRequest("Unknown vault item type.");
        };
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
                detail ? safeDecrypted(item.password()) : "",
                safe(item.website()),
                detail ? safeDecrypted(item.notes()) : "",
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
                detail ? safeDecrypted(item.cardNumber()) : "",
                detail ? safeDecrypted(item.expiryDate()) : "",
                detail ? safeDecrypted(item.cvv()) : "",
                detail ? safeDecrypted(item.cardholderName()) : "",
                owner.id(), safe(owner.fullName()), safe(owner.email())
        );
    }

    private SharedDocumentItemResponse toDocument(
            InternalVaultItemResponse item,
            InternalUserResponse owner
    ) {
        return new SharedDocumentItemResponse(
                item.id(), "DOCUMENT", safe(item.documentName()),
                safe(item.documentType()), "", safeDecrypted(item.documentNotes()),
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
                detail ? safeDecrypted(item.content()) : "",
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

    private String safeDecrypted(String value) {
        String clean = safe(value);
        if (clean.startsWith("v1:")) {
            return "[Unable to decrypt. Please update this item in the owner's vault.]";
        }
        return clean;
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

    private record SelectionPlan(
            List<Long> passwordIds,
            List<Long> cardIds,
            List<Long> documentIds,
            List<Long> noteIds
    ) {
        boolean isEmpty() {
            return passwordIds.isEmpty()
                    && cardIds.isEmpty()
                    && documentIds.isEmpty()
                    && noteIds.isEmpty();
        }
    }

    private record ItemWithOwner(
            InternalVaultItemResponse item,
            InternalUserResponse owner
    ) {}
}
