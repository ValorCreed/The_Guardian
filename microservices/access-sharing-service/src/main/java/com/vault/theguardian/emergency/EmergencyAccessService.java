package com.vault.theguardian.emergency;

import com.vault.theguardian.auth.AuthClient;
import com.vault.theguardian.auth.AuthenticatedUser;
import com.vault.theguardian.auth.InternalUserResponse;
import com.vault.theguardian.notification.NotificationClient;
import com.vault.theguardian.subscription.SubscriptionClient;
import com.vault.theguardian.subscription.SubscriptionEntitlements;
import com.vault.theguardian.vault.InternalVaultItemResponse;
import com.vault.theguardian.vault.VaultClient;
import jakarta.transaction.Transactional;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

import java.time.LocalDateTime;
import java.util.*;
import java.util.stream.Collectors;

@Service
@Transactional
public class EmergencyAccessService {
    private static final int FREE_WAITING_HOURS = 72;

    private final EmergencyContactRepository contactRepository;
    private final EmergencyAccessRequestRepository requestRepository;
    private final EmergencyAccessAuditLogRepository auditRepository;
    private final AuthClient authClient;
    private final SubscriptionClient subscriptionClient;
    private final NotificationClient notificationClient;
    private final VaultClient vaultClient;

    public EmergencyAccessService(
            EmergencyContactRepository contactRepository,
            EmergencyAccessRequestRepository requestRepository,
            EmergencyAccessAuditLogRepository auditRepository,
            AuthClient authClient,
            SubscriptionClient subscriptionClient,
            NotificationClient notificationClient,
            VaultClient vaultClient
    ) {
        this.contactRepository = contactRepository;
        this.requestRepository = requestRepository;
        this.auditRepository = auditRepository;
        this.authClient = authClient;
        this.subscriptionClient = subscriptionClient;
        this.notificationClient = notificationClient;
        this.vaultClient = vaultClient;
    }

    public EmergencyOverviewResponse getOverview(AuthenticatedUser user) {
        refreshAvailableRequestsForOwner(user.id());
        refreshAvailableRequestsForRequester(user.id());

        SubscriptionEntitlements entitlements =
                subscriptionClient.getEntitlements(user.id());

        List<EmergencyContactResponse> contacts = getContacts(user);
        List<EmergencyAccessRequest> receivedEntities =
                requestRepository.findByOwnerIdOrderByRequestedAtDesc(user.id());
        List<EmergencyAccessRequest> sentEntities =
                requestRepository.findByRequesterIdOrderByRequestedAtDesc(user.id());
        List<EmergencyAccessAuditLog> auditEntities =
                auditRepository.findByOwnerIdOrActorIdOrderByCreatedAtDesc(user.id(), user.id())
                        .stream()
                        .limit(30)
                        .toList();

        Set<Long> userIds = new HashSet<>();
        collectRequestUserIds(receivedEntities, userIds);
        collectRequestUserIds(sentEntities, userIds);
        auditEntities.forEach(log -> userIds.add(log.getActorId()));

        Map<Long, InternalUserResponse> users = usersById(userIds);

        return new EmergencyOverviewResponse(
                plan(entitlements),
                isPremiumOrFamily(entitlements),
                contactLimit(entitlements),
                contacts.size(),
                contacts,
                receivedEntities.stream()
                        .map(request -> toRequestResponse(request, users))
                        .toList(),
                sentEntities.stream()
                        .map(request -> toRequestResponse(request, users))
                        .toList(),
                auditEntities.stream()
                        .map(log -> toAuditResponse(log, users.get(log.getActorId())))
                        .toList()
        );
    }

    public List<EmergencyContactResponse> getContacts(AuthenticatedUser user) {
        return contactRepository.findByOwnerIdOrderByCreatedAtDesc(user.id())
                .stream()
                .map(this::toContactResponse)
                .toList();
    }

    public EmergencyContactResponse getContact(AuthenticatedUser user, Long id) {
        return toContactResponse(getOwnedContact(user.id(), id));
    }

    public EmergencyContactResponse createContact(
            AuthenticatedUser owner,
            EmergencyContactRequest request
    ) {
        String contactEmail = normalizeEmail(request.contactEmail());

        if (contactEmail.equalsIgnoreCase(owner.email())) {
            throw badRequest("You cannot add yourself as an emergency contact.");
        }

        SubscriptionEntitlements entitlements =
                subscriptionClient.getEntitlements(owner.id());

        long currentCount = contactRepository.countByOwnerId(owner.id());
        long limit = entitlements.maxEmergencyContacts();

        if (limit >= 0 && currentCount >= limit) {
            throw new ResponseStatusException(
                    HttpStatus.FORBIDDEN,
                    "Emergency contact limit reached for your plan."
            );
        }

        if (contactRepository.findByOwnerIdAndContactEmailIgnoreCase(
                owner.id(), contactEmail
        ).isPresent()) {
            throw new ResponseStatusException(
                    HttpStatus.CONFLICT,
                    "This emergency contact already exists."
            );
        }

        InternalUserResponse contactUser = authClient.findByEmail(contactEmail);
        boolean advancedSharing =
                entitlements.active() && entitlements.canUseEmergencyVaultItemSharing();

        LocalDateTime now = LocalDateTime.now();
        EmergencyContact saved = contactRepository.save(
                EmergencyContact.builder()
                        .ownerId(owner.id())
                        .contactUserId(contactUser == null ? null : contactUser.id())
                        .contactEmail(contactEmail)
                        .contactName(clean(request.contactName(), contactEmail))
                        .relationship(clean(request.relationship(), "Trusted contact"))
                        .waitingPeriodHours(resolveWaitingHours(entitlements, request.waitingPeriodHours()))
                        .allowPasswords(advancedSharing && Boolean.TRUE.equals(request.allowPasswords()))
                        .allowCards(advancedSharing && Boolean.TRUE.equals(request.allowCards()))
                        .allowDocuments(advancedSharing && Boolean.TRUE.equals(request.allowDocuments()))
                        .allowNotes(advancedSharing
                                ? Boolean.TRUE.equals(request.allowNotes())
                                : true)
                        .encryptedEmergencyNote(request.encryptedEmergencyNote())
                        .active(request.active() == null || Boolean.TRUE.equals(request.active()))
                        .createdAt(now)
                        .updatedAt(now)
                        .build()
        );

        notificationClient.notifyEmergencyContactAdded(owner.id(), contactEmail);
        log(owner.id(), owner.id(), EmergencyAuditAction.CONTACT_CREATED,
                "Emergency contact added",
                contactEmail + " was added as a trusted contact.");

        return toContactResponse(saved);
    }

    public EmergencyContactResponse updateContact(
            AuthenticatedUser owner,
            Long id,
            EmergencyContactRequest request
    ) {
        EmergencyContact contact = getOwnedContact(owner.id(), id);
        SubscriptionEntitlements entitlements =
                subscriptionClient.getEntitlements(owner.id());

        boolean advancedSharing =
                entitlements.active() && entitlements.canUseEmergencyVaultItemSharing();

        contact.setContactName(clean(request.contactName(), contact.getContactName()));
        contact.setRelationship(clean(request.relationship(), contact.getRelationship()));
        contact.setWaitingPeriodHours(
                resolveWaitingHours(entitlements, request.waitingPeriodHours())
        );
        contact.setAllowPasswords(
                advancedSharing && Boolean.TRUE.equals(request.allowPasswords())
        );
        contact.setAllowCards(
                advancedSharing && Boolean.TRUE.equals(request.allowCards())
        );
        contact.setAllowDocuments(
                advancedSharing && Boolean.TRUE.equals(request.allowDocuments())
        );
        contact.setAllowNotes(
                advancedSharing ? Boolean.TRUE.equals(request.allowNotes()) : true
        );
        contact.setEncryptedEmergencyNote(request.encryptedEmergencyNote());
        contact.setActive(request.active() == null || Boolean.TRUE.equals(request.active()));
        contact.setUpdatedAt(LocalDateTime.now());

        EmergencyContact saved = contactRepository.save(contact);

        log(owner.id(), owner.id(), EmergencyAuditAction.CONTACT_UPDATED,
                "Emergency contact updated",
                saved.getContactEmail() + " was updated.");

        return toContactResponse(saved);
    }

    public void deleteContact(AuthenticatedUser owner, Long id) {
        EmergencyContact contact = getOwnedContact(owner.id(), id);
        String email = contact.getContactEmail();

        contactRepository.delete(contact);
        notificationClient.notifyEmergencyContactRemoved(owner.id(), email);

        log(owner.id(), owner.id(), EmergencyAuditAction.CONTACT_DELETED,
                "Emergency contact removed",
                email + " was removed from your emergency contacts.");
    }

    public EmergencyAccessRequestResponse requestAccess(
            AuthenticatedUser requester,
            EmergencyAccessRequestDto dto
    ) {
        String ownerEmail = normalizeEmail(dto.ownerEmail());

        if (ownerEmail.equalsIgnoreCase(requester.email())) {
            throw badRequest("You cannot request emergency access to your own vault.");
        }

        InternalUserResponse owner = authClient.findByEmail(ownerEmail);
        if (owner == null) {
            throw new ResponseStatusException(
                    HttpStatus.NOT_FOUND, "Vault owner not found."
            );
        }

        EmergencyContact contact = contactRepository
                .findByOwnerIdAndContactEmailIgnoreCaseAndActiveTrue(
                        owner.id(), requester.email()
                )
                .orElseThrow(() -> new ResponseStatusException(
                        HttpStatus.FORBIDDEN,
                        "You are not listed as an active emergency contact for this user."
                ));

        if (requestRepository.findByContactAndRequesterIdAndStatus(
                contact, requester.id(), EmergencyAccessStatus.PENDING
        ).isPresent()) {
            throw new ResponseStatusException(
                    HttpStatus.CONFLICT,
                    "You already have a pending emergency request for this vault."
            );
        }

        LocalDateTime now = LocalDateTime.now();
        EmergencyAccessRequest saved = requestRepository.save(
                EmergencyAccessRequest.builder()
                        .contact(contact)
                        .ownerId(owner.id())
                        .requesterId(requester.id())
                        .status(EmergencyAccessStatus.PENDING)
                        .message(clean(dto.message(), "Emergency access requested."))
                        .requestedAt(now)
                        .availableAt(now.plusHours(contact.getWaitingPeriodHours()))
                        .build()
        );

        notificationClient.notifyEmergencyAccessRequested(
                owner.id(), requester.email()
        );
        log(owner.id(), requester.id(), EmergencyAuditAction.ACCESS_REQUESTED,
                "Emergency access requested",
                requester.email() + " requested emergency access.");

        return toRequestResponse(saved, usersById(List.of(owner.id(), requester.id())));
    }

    public List<EmergencyAccessRequestResponse> getReceivedRequests(
            AuthenticatedUser owner
    ) {
        refreshAvailableRequestsForOwner(owner.id());

        List<EmergencyAccessRequest> requests =
                requestRepository.findByOwnerIdOrderByRequestedAtDesc(owner.id());

        Set<Long> ids = new HashSet<>();
        collectRequestUserIds(requests, ids);
        Map<Long, InternalUserResponse> users = usersById(ids);

        return requests.stream()
                .map(request -> toRequestResponse(request, users))
                .toList();
    }

    public EmergencyAccessRequestResponse approveRequest(
            AuthenticatedUser owner,
            Long requestId
    ) {
        EmergencyAccessRequest request = requestRepository
                .findByIdAndOwnerId(requestId, owner.id())
                .orElseThrow(() -> new ResponseStatusException(
                        HttpStatus.NOT_FOUND, "Emergency request not found."
                ));

        requireActionable(request);

        LocalDateTime now = LocalDateTime.now();
        request.setStatus(EmergencyAccessStatus.AVAILABLE);
        request.setApprovedAt(now);
        request.setReleasedAt(now);

        EmergencyAccessRequest saved = requestRepository.save(request);
        notificationClient.notifyEmergencyAccessApproved(
                request.getRequesterId(), owner.email()
        );

        InternalUserResponse requester = authClient.requireById(request.getRequesterId());
        log(owner.id(), owner.id(), EmergencyAuditAction.ACCESS_APPROVED,
                "Emergency access approved",
                requester.email() + " was approved for emergency access.");

        return toRequestResponse(
                saved,
                usersById(List.of(owner.id(), request.getRequesterId()))
        );
    }

    public EmergencyAccessRequestResponse denyRequest(
            AuthenticatedUser owner,
            Long requestId
    ) {
        EmergencyAccessRequest request = requestRepository
                .findByIdAndOwnerId(requestId, owner.id())
                .orElseThrow(() -> new ResponseStatusException(
                        HttpStatus.NOT_FOUND, "Emergency request not found."
                ));

        requireActionable(request);

        request.setStatus(EmergencyAccessStatus.DENIED);
        request.setDeniedAt(LocalDateTime.now());

        EmergencyAccessRequest saved = requestRepository.save(request);
        notificationClient.notifyEmergencyAccessDenied(
                request.getRequesterId(), owner.email()
        );

        InternalUserResponse requester = authClient.requireById(request.getRequesterId());
        log(owner.id(), owner.id(), EmergencyAuditAction.ACCESS_DENIED,
                "Emergency access denied",
                requester.email() + " was denied emergency access.");

        return toRequestResponse(
                saved,
                usersById(List.of(owner.id(), request.getRequesterId()))
        );
    }

    public List<EmergencyAuditLogResponse> getAuditLogs(AuthenticatedUser user) {
        List<EmergencyAccessAuditLog> logs =
                auditRepository.findByOwnerIdOrActorIdOrderByCreatedAtDesc(
                        user.id(), user.id()
                );

        Map<Long, InternalUserResponse> users = usersById(
                logs.stream().map(EmergencyAccessAuditLog::getActorId).toList()
        );

        return logs.stream()
                .map(log -> toAuditResponse(log, users.get(log.getActorId())))
                .toList();
    }

    public EmergencyVaultItemsResponse getEmergencyVault(
            AuthenticatedUser requester,
            Long requestId
    ) {
        EmergencyAccessRequest request =
                getReleasedRequestForRequester(requester, requestId);

        EmergencyContact contact = request.getContact();
        InternalUserResponse owner = authClient.requireById(request.getOwnerId());

        List<EmergencyVaultItemResponse> passwords = contact.isAllowPasswords()
                ? vaultClient.list(owner.id(), "passwords").stream()
                    .map(item -> toEmergencyItem(item, owner, false))
                    .toList()
                : List.of();

        List<EmergencyVaultItemResponse> cards = contact.isAllowCards()
                ? vaultClient.list(owner.id(), "cards").stream()
                    .map(item -> toEmergencyItem(item, owner, false))
                    .toList()
                : List.of();

        List<EmergencyVaultItemResponse> documents = contact.isAllowDocuments()
                ? vaultClient.list(owner.id(), "documents").stream()
                    .map(item -> toEmergencyItem(item, owner, false))
                    .toList()
                : List.of();

        List<EmergencyVaultItemResponse> notes = contact.isAllowNotes()
                ? vaultClient.list(owner.id(), "notes").stream()
                    .map(item -> toEmergencyItem(item, owner, false))
                    .toList()
                : List.of();

        log(owner.id(), requester.id(), EmergencyAuditAction.EMERGENCY_VAULT_OPENED,
                "Emergency vault opened",
                requester.email() + " opened your emergency vault.");

        notificationClient.notifyEmergencyVaultViewed(
                owner.id(), requester.email()
        );

        return new EmergencyVaultItemsResponse(
                request.getId(),
                clean(owner.fullName(), owner.email()),
                owner.email(),
                contact.isAllowPasswords(),
                contact.isAllowCards(),
                contact.isAllowDocuments(),
                contact.isAllowNotes(),
                passwords,
                cards,
                documents,
                notes
        );
    }

    public EmergencyVaultItemResponse getEmergencyVaultItem(
            AuthenticatedUser requester,
            Long requestId,
            String itemType,
            Long itemId
    ) {
        EmergencyAccessRequest request =
                getReleasedRequestForRequester(requester, requestId);

        EmergencyContact contact = request.getContact();
        InternalUserResponse owner = authClient.requireById(request.getOwnerId());
        String type = normalizeItemType(itemType);

        requireItemTypeAllowed(contact, type);

        InternalVaultItemResponse item =
                vaultClient.get(owner.id(), routeType(type), itemId);

        EmergencyVaultItemResponse response =
                toEmergencyItem(item, owner, true);

        log(owner.id(), requester.id(), EmergencyAuditAction.EMERGENCY_ITEM_VIEWED,
                "Emergency item viewed",
                requester.email() + " viewed a " + type.toLowerCase()
                        + " item: " + clean(response.title(), "Untitled item") + ".");

        return response;
    }

    private EmergencyAccessRequest getReleasedRequestForRequester(
            AuthenticatedUser requester,
            Long requestId
    ) {
        EmergencyAccessRequest request = requestRepository
                .findByIdAndRequesterId(requestId, requester.id())
                .orElseThrow(() -> new ResponseStatusException(
                        HttpStatus.NOT_FOUND, "Emergency request not found."
                ));

        refreshRequestIfAvailable(request);

        EmergencyContact contact = request.getContact();

        if (contact == null || !contact.isActive()) {
            throw forbidden("This emergency contact is no longer active.");
        }

        if (!contact.getContactEmail().equalsIgnoreCase(requester.email())) {
            throw forbidden("This emergency request does not belong to your email address.");
        }

        if (request.getStatus() != EmergencyAccessStatus.AVAILABLE
                && request.getStatus() != EmergencyAccessStatus.APPROVED) {
            if (request.getStatus() == EmergencyAccessStatus.PENDING) {
                throw forbidden(
                        "Emergency access is still pending. Wait until the waiting period ends or the vault owner approves it."
                );
            }
            throw forbidden("Emergency access is not available for this request.");
        }

        return request;
    }

    private void refreshAvailableRequestsForOwner(Long ownerId) {
        requestRepository.findByOwnerIdOrderByRequestedAtDesc(ownerId)
                .forEach(this::refreshRequestIfAvailable);
    }

    private void refreshAvailableRequestsForRequester(Long requesterId) {
        requestRepository.findByRequesterIdOrderByRequestedAtDesc(requesterId)
                .forEach(this::refreshRequestIfAvailable);
    }

    private void refreshRequestIfAvailable(EmergencyAccessRequest request) {
        LocalDateTime now = LocalDateTime.now();

        if (request.getStatus() == EmergencyAccessStatus.PENDING
                && !request.getAvailableAt().isAfter(now)) {
            request.setStatus(EmergencyAccessStatus.AVAILABLE);
            request.setReleasedAt(now);
            requestRepository.save(request);

            InternalUserResponse owner = authClient.requireById(request.getOwnerId());
            InternalUserResponse requester =
                    authClient.requireById(request.getRequesterId());

            notificationClient.notifyEmergencyAccessAvailable(
                    requester.id(), owner.email()
            );

            log(owner.id(), requester.id(), EmergencyAuditAction.ACCESS_AVAILABLE,
                    "Emergency access available",
                    "Waiting period ended for " + requester.email() + ".");
        }
    }

    private EmergencyContact getOwnedContact(Long ownerId, Long id) {
        return contactRepository.findByIdAndOwnerId(id, ownerId)
                .orElseThrow(() -> new ResponseStatusException(
                        HttpStatus.NOT_FOUND, "Emergency contact not found."
                ));
    }

    private void requireActionable(EmergencyAccessRequest request) {
        if (request.getStatus() != EmergencyAccessStatus.PENDING
                && request.getStatus() != EmergencyAccessStatus.AVAILABLE
                && request.getStatus() != EmergencyAccessStatus.APPROVED) {
            throw badRequest("Only pending emergency requests can be changed.");
        }
    }

    private int resolveWaitingHours(
            SubscriptionEntitlements entitlements,
            Integer requestedHours
    ) {
        if (!entitlements.active()
                || !entitlements.canUseCustomEmergencyWaitingPeriod()) {
            return FREE_WAITING_HOURS;
        }

        int hours = requestedHours == null ? FREE_WAITING_HOURS : requestedHours;
        return hours == 24 || hours == 48 || hours == 72
                ? hours
                : FREE_WAITING_HOURS;
    }

    private void requireItemTypeAllowed(
            EmergencyContact contact,
            String type
    ) {
        boolean allowed = switch (type) {
            case "PASSWORD" -> contact.isAllowPasswords();
            case "CARD" -> contact.isAllowCards();
            case "DOCUMENT" -> contact.isAllowDocuments();
            case "NOTE" -> contact.isAllowNotes();
            default -> false;
        };

        if (!allowed) {
            throw forbidden("This item type is not allowed for this emergency contact.");
        }
    }

    private EmergencyContactResponse toContactResponse(EmergencyContact contact) {
        return new EmergencyContactResponse(
                contact.getId(),
                contact.getContactEmail(),
                contact.getContactName(),
                contact.getRelationship(),
                contact.getWaitingPeriodHours(),
                contact.isAllowPasswords(),
                contact.isAllowCards(),
                contact.isAllowDocuments(),
                contact.isAllowNotes(),
                contact.getEncryptedEmergencyNote(),
                contact.isActive(),
                contact.getCreatedAt(),
                contact.getUpdatedAt()
        );
    }

    private EmergencyAccessRequestResponse toRequestResponse(
            EmergencyAccessRequest request,
            Map<Long, InternalUserResponse> users
    ) {
        EmergencyContact contact = request.getContact();
        InternalUserResponse owner = users.get(request.getOwnerId());
        InternalUserResponse requester = users.get(request.getRequesterId());

        return new EmergencyAccessRequestResponse(
                request.getId(),
                contact.getId(),
                owner == null ? "" : safe(owner.email()),
                owner == null ? "" : clean(owner.fullName(), owner.email()),
                requester == null ? "" : safe(requester.email()),
                requester == null ? "" : clean(requester.fullName(), requester.email()),
                request.getStatus().name(),
                request.getMessage(),
                request.getRequestedAt(),
                request.getAvailableAt(),
                request.getApprovedAt(),
                request.getDeniedAt(),
                contact.isAllowPasswords(),
                contact.isAllowCards(),
                contact.isAllowDocuments(),
                contact.isAllowNotes(),
                contact.getEncryptedEmergencyNote()
        );
    }

    private EmergencyAuditLogResponse toAuditResponse(
            EmergencyAccessAuditLog log,
            InternalUserResponse actor
    ) {
        return new EmergencyAuditLogResponse(
                log.getId(),
                log.getAction().name(),
                log.getTitle(),
                log.getMessage(),
                actor == null ? "" : safe(actor.email()),
                log.getCreatedAt()
        );
    }

    private EmergencyVaultItemResponse toEmergencyItem(
            InternalVaultItemResponse item,
            InternalUserResponse owner,
            boolean detail
    ) {
        String type = item.itemType() == null ? "" : item.itemType().toUpperCase();

        return switch (type) {
            case "PASSWORD" -> new EmergencyVaultItemResponse(
                    item.id(), "PASSWORD", safe(item.title()),
                    safe(item.usernameValue()), detail ? safe(item.password()) : "",
                    safe(item.website()), detail ? safe(item.notes()) : "",
                    null, null, null, null,
                    null, null, null, null, null,
                    null, null, null, null,
                    null, null, null,
                    clean(owner.fullName(), owner.email()), owner.email(),
                    item.createdAt(), item.updatedAt()
            );
            case "CARD" -> new EmergencyVaultItemResponse(
                    item.id(), "CARD", clean(item.cardName(), "Saved Card"),
                    detail ? safe(item.cardholderName()) : "",
                    null, null, null,
                    null, null, null, null,
                    detail ? safe(item.cardNumber()) : "",
                    detail ? safe(item.expiryDate()) : "",
                    detail ? safe(item.cvv()) : "",
                    detail ? safe(item.cardholderName()) : "",
                    detail ? safe(item.cardholderName()) : "",
                    null, null, null, null,
                    null, null, null,
                    clean(owner.fullName(), owner.email()), owner.email(),
                    item.createdAt(), item.updatedAt()
            );
            case "DOCUMENT" -> new EmergencyVaultItemResponse(
                    item.id(), "DOCUMENT", safe(item.documentName()),
                    null, null, null, null,
                    item.documentName(), item.documentType(), item.sizeBytes(), null,
                    null, null, null, null, null,
                    item.documentName(), item.documentType(), "",
                    detail ? safe(item.documentNotes()) : "",
                    null, null, null,
                    clean(owner.fullName(), owner.email()), owner.email(),
                    item.createdAt(), item.updatedAt()
            );
            case "NOTE" -> new EmergencyVaultItemResponse(
                    item.id(), "NOTE", safe(item.title()),
                    null, null, null, null,
                    null, null, null, null,
                    null, null, null, null, null,
                    null, null, null, null,
                    item.category(), detail ? safe(item.content()) : "",
                    item.pinned(),
                    clean(owner.fullName(), owner.email()), owner.email(),
                    item.createdAt(), item.updatedAt()
            );
            default -> throw badRequest("Unknown emergency vault item type.");
        };
    }

    private void log(
            Long ownerId,
            Long actorId,
            EmergencyAuditAction action,
            String title,
            String message
    ) {
        auditRepository.save(
                EmergencyAccessAuditLog.builder()
                        .ownerId(ownerId)
                        .actorId(actorId)
                        .action(action)
                        .title(title)
                        .message(message)
                        .createdAt(LocalDateTime.now())
                        .build()
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

    private void collectRequestUserIds(
            Collection<EmergencyAccessRequest> requests,
            Collection<Long> target
    ) {
        for (EmergencyAccessRequest request : requests) {
            target.add(request.getOwnerId());
            target.add(request.getRequesterId());
        }
    }

    private String plan(SubscriptionEntitlements entitlements) {
        return entitlements.plan() == null || entitlements.plan().isBlank()
                ? "FREE"
                : entitlements.plan();
    }

    private boolean isPremiumOrFamily(SubscriptionEntitlements entitlements) {
        if (!entitlements.active()) return false;
        return "PREMIUM".equalsIgnoreCase(entitlements.plan())
                || "FAMILY".equalsIgnoreCase(entitlements.plan());
    }

    private int contactLimit(SubscriptionEntitlements entitlements) {
        long value = entitlements.maxEmergencyContacts();
        if (value < 0) return Integer.MAX_VALUE;
        return (int) Math.min(Integer.MAX_VALUE, value);
    }

    private String normalizeItemType(String value) {
        String type = value == null ? "" : value.trim().toUpperCase();
        if (!Set.of("PASSWORD", "CARD", "DOCUMENT", "NOTE").contains(type)) {
            throw badRequest("Unknown emergency vault item type.");
        }
        return type;
    }

    private String routeType(String type) {
        return switch (type) {
            case "PASSWORD" -> "passwords";
            case "CARD" -> "cards";
            case "DOCUMENT" -> "documents";
            case "NOTE" -> "notes";
            default -> throw badRequest("Unknown emergency vault item type.");
        };
    }

    private String normalizeEmail(String value) {
        return value == null ? "" : value.trim().toLowerCase();
    }

    private String clean(String value, String fallback) {
        return value == null || value.trim().isBlank()
                ? fallback
                : value.trim();
    }

    private String safe(String value) {
        return value == null ? "" : value.trim();
    }

    private ResponseStatusException badRequest(String message) {
        return new ResponseStatusException(HttpStatus.BAD_REQUEST, message);
    }

    private ResponseStatusException forbidden(String message) {
        return new ResponseStatusException(HttpStatus.FORBIDDEN, message);
    }
}
