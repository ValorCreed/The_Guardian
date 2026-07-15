package com.vault.theguardian.emergency;

import com.vault.theguardian.cards.CreditCardRepository;
import com.vault.theguardian.documents.DocumentRepository;
import com.vault.theguardian.documents.DocumentResponse;
import com.vault.theguardian.documents.DocumentService;
import com.vault.theguardian.documents.DocumentVault;
import com.vault.theguardian.notification.NotificationService;
import com.vault.theguardian.subscription.Subscription;
import com.vault.theguardian.subscription.SubscriptionPlan;
import com.vault.theguardian.subscription.SubscriptionService;
import com.vault.theguardian.user.User;
import com.vault.theguardian.user.UserRepository;
import com.vault.theguardian.vault.VaultItem;
import com.vault.theguardian.vault.VaultItemRepository;
import com.vault.theguardian.notes.SecureNote;
import com.vault.theguardian.notes.SecureNoteRepository;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

import java.lang.reflect.Method;
import java.time.LocalDateTime;
import java.util.List;

@Service
public class EmergencyAccessService {
    private static final int FREE_WAITING_HOURS = 72;

    private final EmergencyContactRepository emergencyContactRepository;
    private final EmergencyAccessRequestRepository emergencyAccessRequestRepository;
    private final EmergencyAccessAuditLogRepository emergencyAccessAuditLogRepository;
    private final UserRepository userRepository;
    private final SubscriptionService subscriptionService;
    private final NotificationService notificationService;
    private final VaultItemRepository vaultItemRepository;
    private final CreditCardRepository creditCardRepository;
    private final DocumentRepository documentRepository;
    private final DocumentService documentService;
    private final SecureNoteRepository secureNoteRepository;

    public EmergencyAccessService(EmergencyContactRepository emergencyContactRepository,
                                  EmergencyAccessRequestRepository emergencyAccessRequestRepository,
                                  EmergencyAccessAuditLogRepository emergencyAccessAuditLogRepository,
                                  UserRepository userRepository,
                                  SubscriptionService subscriptionService,
                                  NotificationService notificationService,
                                  VaultItemRepository vaultItemRepository,
                                  CreditCardRepository creditCardRepository,
                                  DocumentRepository documentRepository,
                                  DocumentService documentService,
                                  SecureNoteRepository secureNoteRepository) {
        this.emergencyContactRepository = emergencyContactRepository;
        this.emergencyAccessRequestRepository = emergencyAccessRequestRepository;
        this.emergencyAccessAuditLogRepository = emergencyAccessAuditLogRepository;
        this.userRepository = userRepository;
        this.subscriptionService = subscriptionService;
        this.notificationService = notificationService;
        this.vaultItemRepository = vaultItemRepository;
        this.creditCardRepository = creditCardRepository;
        this.documentRepository = documentRepository;
        this.documentService = documentService;
        this.secureNoteRepository = secureNoteRepository;
    }

    public EmergencyOverviewResponse getOverview(User user) {
        refreshAvailableRequestsForOwner(user);
        refreshAvailableRequestsForRequester(user);

        Subscription subscription = subscriptionService.getMySubscription(user);
        boolean premiumOrFamily = isPremiumOrFamily(subscription);
        int contactLimit = getContactLimit(subscription);

        List<EmergencyContactResponse> contacts = emergencyContactRepository
                .findByOwnerOrderByCreatedAtDesc(user)
                .stream()
                .map(this::toContactResponse)
                .toList();

        List<EmergencyAccessRequestResponse> received = emergencyAccessRequestRepository
                .findByOwnerOrderByRequestedAtDesc(user)
                .stream()
                .map(this::toRequestResponse)
                .toList();

        List<EmergencyAccessRequestResponse> sent = emergencyAccessRequestRepository
                .findByRequesterOrderByRequestedAtDesc(user)
                .stream()
                .map(this::toRequestResponse)
                .toList();

        List<EmergencyAuditLogResponse> auditLogs = emergencyAccessAuditLogRepository
                .findByOwnerOrActorOrderByCreatedAtDesc(user, user)
                .stream()
                .limit(30)
                .map(this::toAuditResponse)
                .toList();

        return new EmergencyOverviewResponse(
                subscription.getPlan() == null ? "FREE" : subscription.getPlan().name(),
                premiumOrFamily,
                contactLimit,
                contacts.size(),
                contacts,
                received,
                sent,
                auditLogs
        );
    }

    public List<EmergencyContactResponse> getContacts(User user) {
        return emergencyContactRepository.findByOwnerOrderByCreatedAtDesc(user)
                .stream()
                .map(this::toContactResponse)
                .toList();
    }

    public EmergencyContactResponse getContact(User user, Long id) {
        return toContactResponse(getOwnedContact(user, id));
    }

    public EmergencyContactResponse createContact(User owner, EmergencyContactRequest request) {
        String contactEmail = request.contactEmail().trim().toLowerCase();

        if (owner.getEmail().equalsIgnoreCase(contactEmail)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "You cannot add yourself as an emergency contact.");
        }

        long currentCount = emergencyContactRepository.countByOwner(owner);
        if (!subscriptionService.canCreateEmergencyContact(owner, currentCount)) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Emergency contact limit reached for your plan.");
        }

        emergencyContactRepository.findByOwnerAndContactEmailIgnoreCase(owner, contactEmail)
                .ifPresent(existing -> {
                    throw new ResponseStatusException(HttpStatus.CONFLICT, "This emergency contact already exists.");
                });

        User contactUser = userRepository.findByEmail(contactEmail).orElse(null);
        int waitingHours = resolveWaitingHours(owner, request.waitingPeriodHours());
        boolean advancedSharing = subscriptionService.canUseEmergencyVaultItemSharing(owner);
        LocalDateTime now = LocalDateTime.now();

        EmergencyContact contact = EmergencyContact.builder()
                .owner(owner)
                .contactUser(contactUser)
                .contactEmail(contactEmail)
                .contactName(cleanText(request.contactName(), contactEmail))
                .relationship(cleanText(request.relationship(), "Trusted contact"))
                .waitingPeriodHours(waitingHours)
                .allowPasswords(advancedSharing && Boolean.TRUE.equals(request.allowPasswords()))
                .allowCards(advancedSharing && Boolean.TRUE.equals(request.allowCards()))
                .allowDocuments(advancedSharing && Boolean.TRUE.equals(request.allowDocuments()))
                .allowNotes(advancedSharing ? Boolean.TRUE.equals(request.allowNotes()) : true)
                .encryptedEmergencyNote(request.encryptedEmergencyNote())
                .active(request.active() == null || Boolean.TRUE.equals(request.active()))
                .createdAt(now)
                .updatedAt(now)
                .build();

        EmergencyContact saved = emergencyContactRepository.save(contact);
        notificationService.notifyEmergencyContactAdded(owner, saved.getContactEmail());
        log(owner, owner, EmergencyAuditAction.CONTACT_CREATED, "Emergency contact added", saved.getContactEmail() + " was added as a trusted contact.");
        return toContactResponse(saved);
    }

    public EmergencyContactResponse updateContact(User owner, Long id, EmergencyContactRequest request) {
        EmergencyContact contact = getOwnedContact(owner, id);
        boolean advancedSharing = subscriptionService.canUseEmergencyVaultItemSharing(owner);

        contact.setContactName(cleanText(request.contactName(), contact.getContactName()));
        contact.setRelationship(cleanText(request.relationship(), contact.getRelationship()));
        contact.setWaitingPeriodHours(resolveWaitingHours(owner, request.waitingPeriodHours()));
        contact.setAllowPasswords(advancedSharing && Boolean.TRUE.equals(request.allowPasswords()));
        contact.setAllowCards(advancedSharing && Boolean.TRUE.equals(request.allowCards()));
        contact.setAllowDocuments(advancedSharing && Boolean.TRUE.equals(request.allowDocuments()));
        contact.setAllowNotes(advancedSharing ? Boolean.TRUE.equals(request.allowNotes()) : true);
        contact.setEncryptedEmergencyNote(request.encryptedEmergencyNote());
        contact.setActive(request.active() == null || Boolean.TRUE.equals(request.active()));
        contact.setUpdatedAt(LocalDateTime.now());

        EmergencyContact saved = emergencyContactRepository.save(contact);
        log(owner, owner, EmergencyAuditAction.CONTACT_UPDATED, "Emergency contact updated", saved.getContactEmail() + " was updated.");
        return toContactResponse(saved);
    }

    public void deleteContact(User owner, Long id) {
        EmergencyContact contact = getOwnedContact(owner, id);
        String email = contact.getContactEmail();
        emergencyContactRepository.delete(contact);
        notificationService.notifyEmergencyContactRemoved(owner, email);
        log(owner, owner, EmergencyAuditAction.CONTACT_DELETED, "Emergency contact removed", email + " was removed from your emergency contacts.");
    }

    public EmergencyAccessRequestResponse requestAccess(User requester, EmergencyAccessRequestDto dto) {
        String ownerEmail = dto.ownerEmail().trim().toLowerCase();

        if (requester.getEmail().equalsIgnoreCase(ownerEmail)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "You cannot request emergency access to your own vault.");
        }

        User owner = userRepository.findByEmail(ownerEmail)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Vault owner not found."));

        EmergencyContact contact = emergencyContactRepository
                .findByOwnerAndContactEmailIgnoreCaseAndActiveTrue(owner, requester.getEmail())
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.FORBIDDEN, "You are not listed as an active emergency contact for this user."));

        emergencyAccessRequestRepository.findByContactAndRequesterAndStatus(contact, requester, EmergencyAccessStatus.PENDING)
                .ifPresent(existing -> {
                    throw new ResponseStatusException(HttpStatus.CONFLICT, "You already have a pending emergency request for this vault.");
                });

        LocalDateTime now = LocalDateTime.now();
        EmergencyAccessRequest request = EmergencyAccessRequest.builder()
                .contact(contact)
                .owner(owner)
                .requester(requester)
                .status(EmergencyAccessStatus.PENDING)
                .message(cleanText(dto.message(), "Emergency access requested."))
                .requestedAt(now)
                .availableAt(now.plusHours(contact.getWaitingPeriodHours()))
                .build();

        EmergencyAccessRequest saved = emergencyAccessRequestRepository.save(request);
        notificationService.notifyEmergencyAccessRequested(owner, requester.getEmail());
        log(owner, requester, EmergencyAuditAction.ACCESS_REQUESTED, "Emergency access requested", requester.getEmail() + " requested emergency access.");
        return toRequestResponse(saved);
    }

    public List<EmergencyAccessRequestResponse> getReceivedRequests(User owner) {
        refreshAvailableRequestsForOwner(owner);
        return emergencyAccessRequestRepository.findByOwnerOrderByRequestedAtDesc(owner)
                .stream()
                .map(this::toRequestResponse)
                .toList();
    }

    public EmergencyAccessRequestResponse approveRequest(User owner, Long requestId) {
        EmergencyAccessRequest request = emergencyAccessRequestRepository.findByIdAndOwner(requestId, owner)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Emergency request not found."));

        if (request.getStatus() != EmergencyAccessStatus.PENDING && request.getStatus() != EmergencyAccessStatus.AVAILABLE && request.getStatus() != EmergencyAccessStatus.APPROVED) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Only pending emergency requests can be approved.");
        }

        LocalDateTime now = LocalDateTime.now();
        request.setStatus(EmergencyAccessStatus.AVAILABLE);
        request.setApprovedAt(now);
        request.setReleasedAt(now);
        EmergencyAccessRequest saved = emergencyAccessRequestRepository.save(request);

        notificationService.notifyEmergencyAccessApproved(request.getRequester(), owner.getEmail());
        log(owner, owner, EmergencyAuditAction.ACCESS_APPROVED, "Emergency access approved", request.getRequester().getEmail() + " was approved for emergency access.");
        return toRequestResponse(saved);
    }

    public EmergencyAccessRequestResponse denyRequest(User owner, Long requestId) {
        EmergencyAccessRequest request = emergencyAccessRequestRepository.findByIdAndOwner(requestId, owner)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Emergency request not found."));

        if (request.getStatus() != EmergencyAccessStatus.PENDING && request.getStatus() != EmergencyAccessStatus.AVAILABLE && request.getStatus() != EmergencyAccessStatus.APPROVED) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Only pending emergency requests can be denied.");
        }

        request.setStatus(EmergencyAccessStatus.DENIED);
        request.setDeniedAt(LocalDateTime.now());
        EmergencyAccessRequest saved = emergencyAccessRequestRepository.save(request);

        notificationService.notifyEmergencyAccessDenied(request.getRequester(), owner.getEmail());
        log(owner, owner, EmergencyAuditAction.ACCESS_DENIED, "Emergency access denied", request.getRequester().getEmail() + " was denied emergency access.");
        return toRequestResponse(saved);
    }

    public List<EmergencyAuditLogResponse> getAuditLogs(User user) {
        return emergencyAccessAuditLogRepository.findByOwnerOrActorOrderByCreatedAtDesc(user, user)
                .stream()
                .map(this::toAuditResponse)
                .toList();
    }

    public EmergencyVaultItemsResponse getEmergencyVault(User requester, Long requestId) {
        EmergencyAccessRequest request = getReleasedRequestForRequester(requester, requestId);
        EmergencyContact contact = request.getContact();
        User owner = request.getOwner();

        List<EmergencyVaultItemResponse> passwords = contact.isAllowPasswords()
                ? vaultItemRepository.findByUser(owner).stream().map(item -> toPasswordEmergencyResponse(item, owner)).toList()
                : List.of();

        List<EmergencyVaultItemResponse> cards = contact.isAllowCards()
                ? creditCardRepository.findByUser(owner).stream().map(card -> toCardEmergencyResponse(card, owner)).toList()
                : List.of();

        List<EmergencyVaultItemResponse> documents = contact.isAllowDocuments()
                ? documentRepository.findByUser(owner).stream().map(document -> toDocumentEmergencyResponse(document, owner, false)).toList()
                : List.of();

        List<EmergencyVaultItemResponse> notes = contact.isAllowNotes()
                ? secureNoteRepository.findByUserOrderByPinnedDescUpdatedAtDesc(owner).stream().map(note -> toNoteEmergencyResponse(note, owner, false)).toList()
                : List.of();

        log(owner, requester, EmergencyAuditAction.EMERGENCY_VAULT_OPENED, "Emergency vault opened", requester.getEmail() + " opened your emergency vault.");

        return new EmergencyVaultItemsResponse(
                request.getId(),
                cleanText(owner.getFullName(), owner.getEmail()),
                owner.getEmail(),
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

    public EmergencyVaultItemResponse getEmergencyVaultItem(User requester, Long requestId, String itemType, Long itemId) {
        EmergencyAccessRequest request = getReleasedRequestForRequester(requester, requestId);
        EmergencyContact contact = request.getContact();
        User owner = request.getOwner();
        String cleanType = itemType == null ? "" : itemType.trim().toUpperCase();

        EmergencyVaultItemResponse response;

        switch (cleanType) {
            case "PASSWORD" -> {
                if (!contact.isAllowPasswords()) throw forbiddenItemType();
                VaultItem item = vaultItemRepository.findById(itemId)
                        .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Password not found."));
                requireOwnedBy(item.getUser(), owner);
                response = toPasswordEmergencyResponse(item, owner);
            }
            case "CARD" -> {
                if (!contact.isAllowCards()) throw forbiddenItemType();
                Object card = creditCardRepository.findById(itemId)
                        .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Card not found."));
                requireOwnedBy(readUser(card), owner);
                response = toCardEmergencyResponse(card, owner);
            }
            case "DOCUMENT" -> {
                if (!contact.isAllowDocuments()) throw forbiddenItemType();
                DocumentVault document = documentRepository.findById(itemId)
                        .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Document not found."));
                requireOwnedBy(document.getUser(), owner);
                DocumentResponse documentResponse = documentService.getDocument(owner, itemId);
                response = toDocumentEmergencyResponse(documentResponse, document, owner);
            }
            case "NOTE" -> {
                if (!contact.isAllowNotes()) throw forbiddenItemType();
                SecureNote note = secureNoteRepository.findById(itemId)
                        .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Secure note not found."));
                requireOwnedBy(note.getUser(), owner);
                response = toNoteEmergencyResponse(note, owner, true);
            }
            default -> throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Unknown emergency vault item type.");
        }

        log(owner, requester, EmergencyAuditAction.EMERGENCY_ITEM_VIEWED, "Emergency item viewed", requester.getEmail() + " viewed a " + cleanType.toLowerCase() + " item: " + cleanText(response.title(), "Untitled item") + ".");
        return response;
    }

    private EmergencyAccessRequest getReleasedRequestForRequester(User requester, Long requestId) {
        EmergencyAccessRequest request = emergencyAccessRequestRepository.findByIdAndRequester(requestId, requester)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Emergency request not found."));

        refreshRequestIfAvailable(request);

        if (request.getContact() == null || !request.getContact().isActive()) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "This emergency contact is no longer active.");
        }

        if (!request.getContact().getContactEmail().equalsIgnoreCase(requester.getEmail())) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "This emergency request does not belong to your email address.");
        }

        if (request.getStatus() != EmergencyAccessStatus.AVAILABLE && request.getStatus() != EmergencyAccessStatus.APPROVED) {
            if (request.getStatus() == EmergencyAccessStatus.PENDING) {
                throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Emergency access is still pending. Wait until the waiting period ends or the vault owner approves it.");
            }
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Emergency access is not available for this request.");
        }

        return request;
    }

    private void refreshAvailableRequestsForOwner(User owner) {
        emergencyAccessRequestRepository.findByOwnerOrderByRequestedAtDesc(owner)
                .forEach(this::refreshRequestIfAvailable);
    }

    private void refreshAvailableRequestsForRequester(User requester) {
        emergencyAccessRequestRepository.findByRequesterOrderByRequestedAtDesc(requester)
                .forEach(this::refreshRequestIfAvailable);
    }

    private void refreshRequestIfAvailable(EmergencyAccessRequest request) {
        LocalDateTime now = LocalDateTime.now();
        if (request.getStatus() == EmergencyAccessStatus.PENDING && !request.getAvailableAt().isAfter(now)) {
            request.setStatus(EmergencyAccessStatus.AVAILABLE);
            request.setReleasedAt(now);
            emergencyAccessRequestRepository.save(request);
            notificationService.createNotification(
                    request.getRequester(),
                    com.vault.theguardian.notification.NotificationType.EMERGENCY_ACCESS_AVAILABLE,
                    "Emergency access available",
                    "The waiting period for " + request.getOwner().getEmail() + " has ended.",
                    "/emergencyaccess"
            );
            log(request.getOwner(), request.getRequester(), EmergencyAuditAction.ACCESS_AVAILABLE, "Emergency access available", "Waiting period ended for " + request.getRequester().getEmail() + ".");
        }
    }

    private ResponseStatusException forbiddenItemType() {
        return new ResponseStatusException(HttpStatus.FORBIDDEN, "This item type is not allowed for this emergency contact.");
    }

    private void requireOwnedBy(User actualOwner, User expectedOwner) {
        if (actualOwner == null || expectedOwner == null || !actualOwner.getId().equals(expectedOwner.getId())) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "This item is not part of the released emergency vault.");
        }
    }

    private EmergencyContact getOwnedContact(User owner, Long id) {
        return emergencyContactRepository.findByIdAndOwner(id, owner)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Emergency contact not found."));
    }

    private int resolveWaitingHours(User owner, Integer requestedHours) {
        if (!subscriptionService.canUseCustomEmergencyWaitingPeriod(owner)) {
            return FREE_WAITING_HOURS;
        }

        int hours = requestedHours == null ? FREE_WAITING_HOURS : requestedHours;
        if (hours == 24 || hours == 48 || hours == 72) return hours;
        return FREE_WAITING_HOURS;
    }

    private void log(User owner, User actor, EmergencyAuditAction action, String title, String message) {
        emergencyAccessAuditLogRepository.save(
                EmergencyAccessAuditLog.builder()
                        .owner(owner)
                        .actor(actor)
                        .action(action)
                        .title(title)
                        .message(message)
                        .createdAt(LocalDateTime.now())
                        .build()
        );
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

    private EmergencyAccessRequestResponse toRequestResponse(EmergencyAccessRequest request) {
        EmergencyContact contact = request.getContact();
        return new EmergencyAccessRequestResponse(
                request.getId(),
                contact.getId(),
                request.getOwner().getEmail(),
                cleanText(request.getOwner().getFullName(), request.getOwner().getEmail()),
                request.getRequester().getEmail(),
                cleanText(request.getRequester().getFullName(), request.getRequester().getEmail()),
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

    private EmergencyAuditLogResponse toAuditResponse(EmergencyAccessAuditLog log) {
        return new EmergencyAuditLogResponse(
                log.getId(),
                log.getAction().name(),
                log.getTitle(),
                log.getMessage(),
                log.getActor().getEmail(),
                log.getCreatedAt()
        );
    }

    private EmergencyVaultItemResponse toPasswordEmergencyResponse(VaultItem item, User owner) {
        return new EmergencyVaultItemResponse(
                item.getId(),
                "PASSWORD",
                item.getTitle(),
                item.getUsernameValue(),
                item.getEncryptedPassword(),
                item.getWebsite(),
                item.getNotes(),
                null,
                null,
                null,
                null,
                null,
                null,
                null,
                null,
                null,
                null,
                null,
                null,
                null,
                null,
                null,
                null,
                cleanText(owner.getFullName(), owner.getEmail()),
                owner.getEmail(),
                item.getCreatedAt(),
                item.getUpdatedAt()
        );
    }

    private EmergencyVaultItemResponse toCardEmergencyResponse(Object card, User owner) {
        return new EmergencyVaultItemResponse(
                readLong(card, "getId"),
                "CARD",
                cleanText(readString(card, "getCardName"), "Saved Card"),
                readFirstString(card, "getEncryptedCardholderName", "getEncryptedCardHolderName"),
                null,
                null,
                null,
                null,
                null,
                null,
                null,
                readString(card, "getEncryptedCardNumber"),
                readString(card, "getEncryptedExpiryDate"),
                readString(card, "getEncryptedCvv"),
                readString(card, "getEncryptedCardholderName"),
                readString(card, "getEncryptedCardHolderName"),
                null,
                null,
                null,
                null,
                null,
                null,
                null,
                cleanText(owner.getFullName(), owner.getEmail()),
                owner.getEmail(),
                readDateTime(card, "getCreatedAt"),
                readDateTime(card, "getUpdatedAt")
        );
    }

    private EmergencyVaultItemResponse toDocumentEmergencyResponse(DocumentVault document, User owner, boolean includeFileData) {
        return new EmergencyVaultItemResponse(
                document.getId(),
                "DOCUMENT",
                document.getDocumentName(),
                null,
                null,
                null,
                null,
                document.getDocumentName(),
                document.getDocumentType(),
                extractSizeBytes(document.getEncryptedNotes()),
                null,
                null,
                null,
                null,
                null,
                null,
                document.getDocumentName(),
                document.getDocumentType(),
                includeFileData ? document.getEncryptedFileUrl() : "",
                document.getEncryptedNotes(),
                null,
                null,
                null,
                cleanText(owner.getFullName(), owner.getEmail()),
                owner.getEmail(),
                document.getCreatedAt(),
                null
        );
    }

    private EmergencyVaultItemResponse toDocumentEmergencyResponse(DocumentResponse response, DocumentVault document, User owner) {
        return new EmergencyVaultItemResponse(
                response.id(),
                "DOCUMENT",
                response.documentName(),
                null,
                null,
                null,
                null,
                response.documentName(),
                response.documentType(),
                extractSizeBytes(response.encryptedNotes()),
                null,
                null,
                null,
                null,
                null,
                null,
                response.documentName(),
                response.documentType(),
                response.encryptedFileUrl(),
                response.encryptedNotes(),
                null,
                null,
                null,
                cleanText(owner.getFullName(), owner.getEmail()),
                owner.getEmail(),
                document.getCreatedAt(),
                null
        );
    }

    private EmergencyVaultItemResponse toNoteEmergencyResponse(SecureNote note, User owner, boolean includeContent) {
        return new EmergencyVaultItemResponse(
                note.getId(),
                "NOTE",
                note.getTitle(),
                null,
                null,
                null,
                null,
                null,
                note.getCategory(),
                null,
                null,
                null,
                null,
                null,
                null,
                null,
                null,
                null,
                null,
                null,
                note.getCategory(),
                includeContent ? note.getEncryptedContent() : "",
                note.isPinned(),
                cleanText(owner.getFullName(), owner.getEmail()),
                owner.getEmail(),
                note.getCreatedAt(),
                note.getUpdatedAt()
        );
    }

    private User readUser(Object object) {
        Object value = callGetter(object, "getUser");
        if (value instanceof User user) return user;
        return null;
    }

    private Long readLong(Object object, String getter) {
        Object value = callGetter(object, getter);
        if (value instanceof Number number) return number.longValue();
        return null;
    }

    private String readString(Object object, String getter) {
        Object value = callGetter(object, getter);
        return value == null ? null : String.valueOf(value);
    }

    private String readFirstString(Object object, String... getters) {
        for (String getter : getters) {
            String value = readString(object, getter);
            if (value != null && !value.isBlank()) return value;
        }
        return null;
    }

    private LocalDateTime readDateTime(Object object, String getter) {
        Object value = callGetter(object, getter);
        if (value instanceof LocalDateTime dateTime) return dateTime;
        return null;
    }

    private Object callGetter(Object object, String getter) {
        if (object == null) return null;
        try {
            Method method = object.getClass().getMethod(getter);
            return method.invoke(object);
        } catch (Exception ignored) {
            return null;
        }
    }

    private Long extractSizeBytes(String encryptedNotes) {
        if (encryptedNotes == null) return null;
        try {
            String marker = "\"sizeBytes\":";
            int index = encryptedNotes.indexOf(marker);
            if (index < 0) return null;
            int start = index + marker.length();
            int end = start;
            while (end < encryptedNotes.length() && Character.isDigit(encryptedNotes.charAt(end))) {
                end++;
            }
            if (end <= start) return null;
            return Long.parseLong(encryptedNotes.substring(start, end));
        } catch (Exception ignored) {
            return null;
        }
    }

    private boolean isPremiumOrFamily(Subscription subscription) {
        return subscription.isActive()
                && (subscription.getPlan() == SubscriptionPlan.PREMIUM
                || subscription.getPlan() == SubscriptionPlan.FAMILY);
    }

    private int getContactLimit(Subscription subscription) {
        if (!subscription.isActive() || subscription.getPlan() == null || subscription.getPlan() == SubscriptionPlan.FREE) return 1;
        if (subscription.getPlan() == SubscriptionPlan.PREMIUM) return 3;
        if (subscription.getPlan() == SubscriptionPlan.FAMILY) return 6;
        return 1;
    }

    private String cleanText(String value, String fallback) {
        if (value == null || value.trim().isBlank()) return fallback;
        return value.trim();
    }
}
