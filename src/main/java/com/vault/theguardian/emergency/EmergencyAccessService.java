package com.vault.theguardian.emergency;

import com.vault.theguardian.notification.NotificationService;
import com.vault.theguardian.subscription.Subscription;
import com.vault.theguardian.subscription.SubscriptionPlan;
import com.vault.theguardian.subscription.SubscriptionService;
import com.vault.theguardian.user.User;
import com.vault.theguardian.user.UserRepository;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

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

    public EmergencyAccessService(EmergencyContactRepository emergencyContactRepository,
                                  EmergencyAccessRequestRepository emergencyAccessRequestRepository,
                                  EmergencyAccessAuditLogRepository emergencyAccessAuditLogRepository,
                                  UserRepository userRepository,
                                  SubscriptionService subscriptionService,
                                  NotificationService notificationService) {
        this.emergencyContactRepository = emergencyContactRepository;
        this.emergencyAccessRequestRepository = emergencyAccessRequestRepository;
        this.emergencyAccessAuditLogRepository = emergencyAccessAuditLogRepository;
        this.userRepository = userRepository;
        this.subscriptionService = subscriptionService;
        this.notificationService = notificationService;
    }

    public EmergencyOverviewResponse getOverview(User user) {
        refreshAvailableRequests(user);

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
        refreshAvailableRequests(owner);
        return emergencyAccessRequestRepository.findByOwnerOrderByRequestedAtDesc(owner)
                .stream()
                .map(this::toRequestResponse)
                .toList();
    }

    public EmergencyAccessRequestResponse approveRequest(User owner, Long requestId) {
        EmergencyAccessRequest request = emergencyAccessRequestRepository.findByIdAndOwner(requestId, owner)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Emergency request not found."));

        if (request.getStatus() != EmergencyAccessStatus.PENDING && request.getStatus() != EmergencyAccessStatus.AVAILABLE) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Only pending emergency requests can be approved.");
        }

        request.setStatus(EmergencyAccessStatus.APPROVED);
        request.setApprovedAt(LocalDateTime.now());
        EmergencyAccessRequest saved = emergencyAccessRequestRepository.save(request);

        notificationService.notifyEmergencyAccessApproved(request.getRequester(), owner.getEmail());
        log(owner, owner, EmergencyAuditAction.ACCESS_APPROVED, "Emergency access approved", request.getRequester().getEmail() + " was approved for emergency access.");
        return toRequestResponse(saved);
    }

    public EmergencyAccessRequestResponse denyRequest(User owner, Long requestId) {
        EmergencyAccessRequest request = emergencyAccessRequestRepository.findByIdAndOwner(requestId, owner)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Emergency request not found."));

        if (request.getStatus() != EmergencyAccessStatus.PENDING && request.getStatus() != EmergencyAccessStatus.AVAILABLE) {
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

    private void refreshAvailableRequests(User user) {
        LocalDateTime now = LocalDateTime.now();
        List<EmergencyAccessRequest> requests = emergencyAccessRequestRepository.findByOwnerOrderByRequestedAtDesc(user);

        for (EmergencyAccessRequest request : requests) {
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
