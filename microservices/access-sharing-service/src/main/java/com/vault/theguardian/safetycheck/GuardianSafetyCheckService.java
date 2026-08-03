package com.vault.theguardian.safetycheck;

import com.vault.theguardian.auth.AuthClient;
import com.vault.theguardian.auth.AuthenticatedUser;
import com.vault.theguardian.auth.InternalUserResponse;
import com.vault.theguardian.emergency.*;
import com.vault.theguardian.estate.EstatePlaybookService;
import com.vault.theguardian.notification.NotificationClient;
import com.vault.theguardian.subscription.SubscriptionClient;
import com.vault.theguardian.subscription.SubscriptionEntitlements;
import jakarta.transaction.Transactional;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

import java.time.Instant;
import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.Set;

@Service
@Transactional
public class GuardianSafetyCheckService {
    private static final Logger log = LoggerFactory.getLogger(GuardianSafetyCheckService.class);
    private static final Set<Integer> ALLOWED_INTERVAL_DAYS = Set.of(1, 3, 7, 14, 30);
    private static final Set<Integer> ALLOWED_GRACE_HOURS = Set.of(12, 24, 48, 72);

    private final GuardianSafetyCheckRepository safetyCheckRepository;
    private final EmergencyContactRepository contactRepository;
    private final EmergencyAccessRequestRepository requestRepository;
    private final EmergencyAccessAuditLogRepository auditRepository;
    private final SubscriptionClient subscriptionClient;
    private final AuthClient authClient;
    private final NotificationClient notificationClient;
    private final EstatePlaybookService estatePlaybookService;

    public GuardianSafetyCheckService(
            GuardianSafetyCheckRepository safetyCheckRepository,
            EmergencyContactRepository contactRepository,
            EmergencyAccessRequestRepository requestRepository,
            EmergencyAccessAuditLogRepository auditRepository,
            SubscriptionClient subscriptionClient,
            AuthClient authClient,
            NotificationClient notificationClient,
            EstatePlaybookService estatePlaybookService
    ) {
        this.safetyCheckRepository = safetyCheckRepository;
        this.contactRepository = contactRepository;
        this.requestRepository = requestRepository;
        this.auditRepository = auditRepository;
        this.subscriptionClient = subscriptionClient;
        this.authClient = authClient;
        this.notificationClient = notificationClient;
        this.estatePlaybookService = estatePlaybookService;
    }

    public SafetyCheckResponse getSafetyCheck(AuthenticatedUser owner) {
        GuardianSafetyCheck safetyCheck =
                safetyCheckRepository.findByOwnerIdForUpdate(owner.id()).orElse(null);
        safetyCheck = disableIfContactBecameIneligible(safetyCheck);

        SubscriptionEntitlements entitlements = tryGetEntitlements(owner.id());

        return toResponse(
                safetyCheck,
                entitlements,
                contactOptions(owner.id()),
                statusMessage(safetyCheck)
        );
    }

    public SafetyCheckResponse updateSafetyCheck(
            AuthenticatedUser owner,
            UpdateSafetyCheckRequest request
    ) {
        GuardianSafetyCheck existing =
                safetyCheckRepository.findByOwnerIdForUpdate(owner.id()).orElse(null);

        if (!Boolean.TRUE.equals(request.enabled())) {
            SubscriptionEntitlements entitlements = tryGetEntitlements(owner.id());
            if (existing == null) {
                return toResponse(
                        null,
                        entitlements,
                        contactOptions(owner.id()),
                        "Guardian Safety Check is not configured."
                );
            }

            existing.setStatus(SafetyCheckStatus.DISABLED);
            existing.setNextCheckInAt(null);
            existing.setGraceStartedAt(null);
            existing.setUpdatedAt(Instant.now());
            GuardianSafetyCheck saved = safetyCheckRepository.save(existing);

            notificationClient.notifySafetyCheckDisabled(owner.id());
            log(
                    owner.id(),
                    EmergencyAuditAction.SAFETY_CHECK_DISABLED,
                    "Guardian Safety Check disabled",
                    "Automatic safety check-ins were disabled."
            );

            return toResponse(
                    saved,
                    entitlements,
                    contactOptions(owner.id()),
                    "Guardian Safety Check is disabled."
            );
        }

        SubscriptionEntitlements entitlements =
                subscriptionClient.getEntitlements(owner.id());
        requireEligible(entitlements);

        Long contactId = request.contactId();
        if (contactId == null) {
            throw badRequest("Choose an emergency contact for Guardian Safety Check.");
        }

        int intervalDays = requireAllowedInterval(request.intervalDays());
        int gracePeriodHours = requireAllowedGracePeriod(request.gracePeriodHours());
        EmergencyContact contact = contactRepository
                .findByIdAndOwnerId(contactId, owner.id())
                .orElseThrow(() -> new ResponseStatusException(
                        HttpStatus.NOT_FOUND,
                        "Emergency contact not found."
                ));

        requireEligibleContact(owner.id(), contact);

        Instant now = Instant.now();
        GuardianSafetyCheck safetyCheck = existing == null
                ? GuardianSafetyCheck.builder()
                .ownerId(owner.id())
                .createdAt(now)
                .version(0)
                .build()
                : existing;

        safetyCheck.setContact(contact);
        safetyCheck.setIntervalDays(intervalDays);
        safetyCheck.setGracePeriodHours(gracePeriodHours);
        safetyCheck.setStatus(SafetyCheckStatus.ACTIVE);
        safetyCheck.setLastCheckInAt(now);
        safetyCheck.setNextCheckInAt(now.plus(intervalDays, ChronoUnit.DAYS));
        safetyCheck.setGraceStartedAt(null);
        safetyCheck.setTriggeredAt(null);
        safetyCheck.setTriggeredRequest(null);
        safetyCheck.setUpdatedAt(now);

        GuardianSafetyCheck saved = safetyCheckRepository.save(safetyCheck);

        notificationClient.notifySafetyCheckConfigured(
                owner.id(),
                contact.getContactEmail(),
                intervalDays
        );
        log(
                owner.id(),
                EmergencyAuditAction.SAFETY_CHECK_CONFIGURED,
                "Guardian Safety Check configured",
                "A check-in is required every " + intervalDays
                        + plural(intervalDays, " day", " days")
                        + ". " + contact.getContactEmail()
                        + " is the release contact."
        );

        return toResponse(
                saved,
                entitlements,
                contactOptions(owner.id()),
                "Guardian Safety Check is active."
        );
    }

    public SafetyCheckResponse checkIn(AuthenticatedUser owner) {
        GuardianSafetyCheck safetyCheck = safetyCheckRepository
                .findByOwnerIdForUpdate(owner.id())
                .orElseThrow(() -> new ResponseStatusException(
                        HttpStatus.NOT_FOUND,
                        "Guardian Safety Check has not been configured."
                ));

        if (safetyCheck.getStatus() == SafetyCheckStatus.DISABLED) {
            throw badRequest("Enable Guardian Safety Check before checking in.");
        }

        GuardianSafetyCheck checkedSafetyCheck =
                disableIfContactBecameIneligible(safetyCheck);
        if (checkedSafetyCheck.getStatus() == SafetyCheckStatus.DISABLED) {
            SubscriptionEntitlements entitlements = tryGetEntitlements(owner.id());
            return toResponse(
                    checkedSafetyCheck,
                    entitlements,
                    contactOptions(owner.id()),
                    "Safety Check was disabled because the selected contact is no longer eligible."
            );
        }
        safetyCheck = checkedSafetyCheck;

        if (safetyCheck.getStatus() == SafetyCheckStatus.TRIGGERED) {
            throw new ResponseStatusException(
                    HttpStatus.CONFLICT,
                    "This safety check already released emergency access. Review the event, then enable a new cycle."
            );
        }

        Instant now = Instant.now();
        safetyCheck.setStatus(SafetyCheckStatus.ACTIVE);
        safetyCheck.setLastCheckInAt(now);
        safetyCheck.setNextCheckInAt(now.plus(safetyCheck.getIntervalDays(), ChronoUnit.DAYS));
        safetyCheck.setGraceStartedAt(null);
        safetyCheck.setUpdatedAt(now);

        GuardianSafetyCheck saved = safetyCheckRepository.save(safetyCheck);
        SubscriptionEntitlements entitlements = tryGetEntitlements(owner.id());

        notificationClient.notifySafetyCheckCompleted(owner.id());
        log(
                owner.id(),
                EmergencyAuditAction.SAFETY_CHECK_COMPLETED,
                "Safety check-in completed",
                "Your next Guardian Safety Check is scheduled."
        );

        return toResponse(
                saved,
                entitlements,
                contactOptions(owner.id()),
                "Check-in complete. Your safety timer has been reset."
        );
    }

    public List<Long> findDueSafetyCheckIds(Instant now) {
        List<Long> dueIds = new java.util.ArrayList<>();

        safetyCheckRepository
                .findByStatusAndNextCheckInAtLessThanEqualOrderByNextCheckInAtAsc(
                        SafetyCheckStatus.ACTIVE,
                        now
                )
                .forEach(check -> dueIds.add(check.getId()));

        safetyCheckRepository
                .findByStatusAndGraceStartedAtLessThanEqualOrderByGraceStartedAtAsc(
                        SafetyCheckStatus.GRACE,
                        now.minus(12, ChronoUnit.HOURS)
                )
                .forEach(check -> {
                    if (!dueIds.contains(check.getId())) {
                        dueIds.add(check.getId());
                    }
                });

        return dueIds;
    }

    public void processDueSafetyCheck(Long safetyCheckId, Instant now) {
        GuardianSafetyCheck safetyCheck = safetyCheckRepository
                .findByIdForUpdate(safetyCheckId)
                .orElse(null);

        if (safetyCheck == null) return;

        if (safetyCheck.getStatus() == SafetyCheckStatus.ACTIVE) {
            Instant nextCheckInAt = safetyCheck.getNextCheckInAt();
            if (nextCheckInAt == null || nextCheckInAt.isAfter(now)) return;

            beginGracePeriod(safetyCheck, now);
            return;
        }

        if (safetyCheck.getStatus() == SafetyCheckStatus.GRACE) {
            releaseIfGraceExpired(safetyCheck, now);
        }
    }

    private void beginGracePeriod(GuardianSafetyCheck safetyCheck, Instant now) {
        safetyCheck.setStatus(SafetyCheckStatus.GRACE);
        safetyCheck.setGraceStartedAt(now);
        safetyCheck.setUpdatedAt(now);
        safetyCheckRepository.save(safetyCheck);

        EmergencyContact contact = safetyCheck.getContact();
        notificationClient.notifySafetyCheckGraceStarted(
                safetyCheck.getOwnerId(),
                contact == null ? "" : contact.getContactEmail(),
                safetyCheck.getGracePeriodHours()
        );
        log(
                safetyCheck.getOwnerId(),
                EmergencyAuditAction.SAFETY_CHECK_GRACE_STARTED,
                "Safety Check grace period started",
                "The scheduled check-in was missed. Emergency access will be released if the grace period ends."
        );
    }

    private void releaseIfGraceExpired(
            GuardianSafetyCheck safetyCheck,
            Instant now
    ) {
        Instant graceStartedAt = safetyCheck.getGraceStartedAt();
        if (graceStartedAt == null
                || graceStartedAt.plus(
                safetyCheck.getGracePeriodHours(),
                ChronoUnit.HOURS
        ).isAfter(now)) {
            return;
        }

        EmergencyContact contact = safetyCheck.getContact();
        boolean categoryScope = contact != null && hasSharedItems(contact);
        boolean playbookScope = contact != null
                && estatePlaybookService.hasActiveSafetyCheckPlaybooksForContact(
                safetyCheck.getOwnerId(),
                contact.getId()
        );
        if (contact == null
                || !contact.isActive()
                || contact.getContactUserId() == null
                || (!categoryScope && !playbookScope)) {
            disableForIneligibleContact(safetyCheck, now);
            return;
        }

        EmergencyAccessRequest releaseRequest = categoryScope
                ? findOrCreateReleaseRequest(safetyCheck, contact, now)
                : null;

        InternalUserResponse owner =
                authClient.requireById(safetyCheck.getOwnerId());
        // Use the persisted grace-start instant as the idempotency key for this
        // specific cycle. The same GuardianSafetyCheck row is reused across
        // cycles, so using safetyCheck.getId() would suppress future releases.
        long cycleReference = graceStartedAt.toEpochMilli();
        int releasedPlaybooks = estatePlaybookService.releaseForSafetyCheck(
                owner.id(),
                contact,
                cycleReference
        );

        if (!categoryScope && releasedPlaybooks == 0) {
            disableForIneligibleContact(safetyCheck, now);
            return;
        }

        safetyCheck.setStatus(SafetyCheckStatus.TRIGGERED);
        safetyCheck.setTriggeredAt(now);
        safetyCheck.setTriggeredRequest(releaseRequest);
        safetyCheck.setNextCheckInAt(null);
        safetyCheck.setUpdatedAt(now);
        safetyCheckRepository.save(safetyCheck);

        notificationClient.notifySafetyCheckTriggeredOwner(
                owner.id(),
                contact.getContactEmail()
        );
        notificationClient.notifySafetyCheckTriggeredContact(
                contact.getContactUserId(),
                owner.email(),
                categoryScope
        );
        log(
                owner.id(),
                EmergencyAuditAction.SAFETY_CHECK_TRIGGERED,
                "Guardian Safety Check triggered",
                "The grace period ended and approved emergency information was released to "
                        + contact.getContactEmail() + "."
        );
    }

    private EmergencyAccessRequest findOrCreateReleaseRequest(
            GuardianSafetyCheck safetyCheck,
            EmergencyContact contact,
            Instant now
    ) {
        List<EmergencyAccessStatus> reusableStatuses = List.of(
                EmergencyAccessStatus.PENDING,
                EmergencyAccessStatus.AVAILABLE,
                EmergencyAccessStatus.APPROVED
        );

        EmergencyAccessRequest existing = requestRepository
                .findFirstByContactAndRequesterIdAndStatusInOrderByRequestedAtDesc(
                        contact,
                        contact.getContactUserId(),
                        reusableStatuses
                )
                .orElse(null);

        LocalDateTime utcNow = LocalDateTime.ofInstant(now, ZoneOffset.UTC);

        if (existing != null) {
            if (existing.getStatus() == EmergencyAccessStatus.PENDING) {
                existing.setStatus(EmergencyAccessStatus.AVAILABLE);
                existing.setAvailableAt(utcNow);
                existing.setReleasedAt(utcNow);
                return requestRepository.save(existing);
            }
            return existing;
        }

        return requestRepository.save(
                EmergencyAccessRequest.builder()
                        .contact(contact)
                        .ownerId(safetyCheck.getOwnerId())
                        .requesterId(contact.getContactUserId())
                        .status(EmergencyAccessStatus.AVAILABLE)
                        .message(
                                "Automatically released by Guardian Safety Check after a missed check-in and grace period."
                        )
                        .requestedAt(utcNow)
                        .availableAt(utcNow)
                        .releasedAt(utcNow)
                        .build()
        );
    }

    private SafetyCheckResponse toResponse(
            GuardianSafetyCheck safetyCheck,
            SubscriptionEntitlements entitlements,
            List<SafetyCheckContactOption> contacts,
            String message
    ) {
        EmergencyContact contact =
                safetyCheck == null ? null : safetyCheck.getContact();
        EmergencyAccessRequest triggeredRequest =
                safetyCheck == null ? null : safetyCheck.getTriggeredRequest();
        SafetyCheckStatus status =
                safetyCheck == null ? SafetyCheckStatus.DISABLED : safetyCheck.getStatus();

        return new SafetyCheckResponse(
                plan(entitlements),
                isEligible(entitlements)
                        || (safetyCheck != null
                        && status != SafetyCheckStatus.DISABLED),
                isEligible(entitlements),
                safetyCheck != null,
                status != SafetyCheckStatus.DISABLED,
                status.name(),
                contact == null ? null : contact.getId(),
                contact == null ? null : clean(contact.getContactName(), contact.getContactEmail()),
                contact == null ? null : contact.getContactEmail(),
                safetyCheck == null ? null : safetyCheck.getIntervalDays(),
                safetyCheck == null ? null : safetyCheck.getGracePeriodHours(),
                safetyCheck == null ? null : safetyCheck.getLastCheckInAt(),
                safetyCheck == null ? null : safetyCheck.getNextCheckInAt(),
                safetyCheck == null ? null : safetyCheck.getGraceStartedAt(),
                safetyCheck == null ? null : safetyCheck.getTriggeredAt(),
                triggeredRequest == null ? null : triggeredRequest.getId(),
                contacts,
                message
        );
    }

    private List<SafetyCheckContactOption> contactOptions(Long ownerId) {
        return contactRepository.findByOwnerIdOrderByCreatedAtDesc(ownerId)
                .stream()
                .map(contact -> new SafetyCheckContactOption(
                        contact.getId(),
                        clean(contact.getContactName(), contact.getContactEmail()),
                        contact.getContactEmail(),
                        clean(contact.getRelationship(), "Trusted contact"),
                        contact.getContactUserId() != null,
                        contact.isActive(),
                        hasReleaseScope(ownerId, contact)
                ))
                .toList();
    }

    private void requireEligible(SubscriptionEntitlements entitlements) {
        if (!isEligible(entitlements)) {
            throw new ResponseStatusException(
                    HttpStatus.FORBIDDEN,
                    "Guardian Safety Check is available on Premium and Family plans."
            );
        }
    }

    private boolean isEligible(SubscriptionEntitlements entitlements) {
        if (entitlements == null || !entitlements.active()) return false;

        boolean paidPlan =
                "PREMIUM".equalsIgnoreCase(entitlements.plan())
                        || "FAMILY".equalsIgnoreCase(entitlements.plan());

        return paidPlan && entitlements.canUseEmergencyVaultItemSharing();
    }

    private void requireEligibleContact(Long ownerId, EmergencyContact contact) {
        if (!contact.isActive()) {
            throw badRequest("Choose an active emergency contact.");
        }
        if (contact.getContactUserId() == null) {
            throw badRequest(
                    "This contact must create a Guardian account before automatic release can be enabled."
            );
        }
        if (!hasReleaseScope(ownerId, contact)) {
            throw badRequest(
                    "Allow at least one emergency vault category or create an active Safety Check estate playbook for this contact."
            );
        }
    }

    private GuardianSafetyCheck disableIfContactBecameIneligible(
            GuardianSafetyCheck safetyCheck
    ) {
        if (safetyCheck == null
                || safetyCheck.getStatus() == SafetyCheckStatus.DISABLED
                || safetyCheck.getStatus() == SafetyCheckStatus.TRIGGERED) {
            return safetyCheck;
        }

        EmergencyContact contact = safetyCheck.getContact();
        if (contact != null
                && contact.isActive()
                && contact.getContactUserId() != null
                && hasReleaseScope(safetyCheck.getOwnerId(), contact)) {
            return safetyCheck;
        }

        safetyCheck.setStatus(SafetyCheckStatus.DISABLED);
        safetyCheck.setNextCheckInAt(null);
        safetyCheck.setGraceStartedAt(null);
        safetyCheck.setUpdatedAt(Instant.now());

        GuardianSafetyCheck saved = safetyCheckRepository.save(safetyCheck);
        notificationClient.notifySafetyCheckDisabledByContact(saved.getOwnerId());
        log(
                saved.getOwnerId(),
                EmergencyAuditAction.SAFETY_CHECK_DISABLED,
                "Safety Check disabled",
                "The selected emergency contact is no longer eligible for automatic release."
        );
        return saved;
    }

    private boolean hasReleaseScope(Long ownerId, EmergencyContact contact) {
        return contact != null
                && (hasSharedItems(contact)
                || estatePlaybookService.hasActiveSafetyCheckPlaybooksForContact(
                ownerId,
                contact.getId()
        ));
    }

    private void disableForIneligibleContact(
            GuardianSafetyCheck safetyCheck,
            Instant now
    ) {
        safetyCheck.setStatus(SafetyCheckStatus.DISABLED);
        safetyCheck.setNextCheckInAt(null);
        safetyCheck.setGraceStartedAt(null);
        safetyCheck.setUpdatedAt(now);
        safetyCheckRepository.save(safetyCheck);

        notificationClient.notifySafetyCheckDisabledByContact(
                safetyCheck.getOwnerId()
        );
        log(
                safetyCheck.getOwnerId(),
                EmergencyAuditAction.SAFETY_CHECK_DISABLED,
                "Safety Check disabled",
                "The selected emergency contact no longer has an eligible release scope."
        );
    }

    private boolean hasSharedItems(EmergencyContact contact) {
        return contact.isAllowPasswords()
                || contact.isAllowCards()
                || contact.isAllowDocuments()
                || contact.isAllowNotes();
    }

    private int requireAllowedInterval(Integer value) {
        int interval = value == null ? 7 : value;
        if (!ALLOWED_INTERVAL_DAYS.contains(interval)) {
            throw badRequest("Choose a check-in interval of 1, 3, 7, 14, or 30 days.");
        }
        return interval;
    }

    private int requireAllowedGracePeriod(Integer value) {
        int hours = value == null ? 24 : value;
        if (!ALLOWED_GRACE_HOURS.contains(hours)) {
            throw badRequest("Choose a grace period of 12, 24, 48, or 72 hours.");
        }
        return hours;
    }

    private String statusMessage(GuardianSafetyCheck safetyCheck) {
        if (safetyCheck == null) {
            return "Set up periodic check-ins and automatic emergency release.";
        }

        return switch (safetyCheck.getStatus()) {
            case ACTIVE -> "Guardian Safety Check is active.";
            case GRACE -> "A check-in was missed. Complete it before the grace period ends.";
            case TRIGGERED -> "Approved emergency information was released after the grace period ended.";
            case DISABLED -> "Guardian Safety Check is disabled.";
        };
    }

    private void log(
            Long ownerId,
            EmergencyAuditAction action,
            String title,
            String message
    ) {
        auditRepository.save(
                EmergencyAccessAuditLog.builder()
                        .ownerId(ownerId)
                        .actorId(ownerId)
                        .action(action)
                        .title(title)
                        .message(message)
                        .createdAt(LocalDateTime.now(ZoneOffset.UTC))
                        .build()
        );
    }

    private SubscriptionEntitlements tryGetEntitlements(Long ownerId) {
        try {
            return subscriptionClient.getEntitlements(ownerId);
        } catch (RuntimeException exception) {
            log.warn(
                    "Safety Check subscription entitlements could not be refreshed for ownerId={}: {}",
                    ownerId,
                    exception.getMessage()
            );
            return null;
        }
    }

    private String plan(SubscriptionEntitlements entitlements) {
        if (entitlements == null) return "UNKNOWN";
        return entitlements.plan() == null || entitlements.plan().isBlank()
                ? "FREE"
                : entitlements.plan().trim().toUpperCase();
    }

    private String clean(String value, String fallback) {
        return value == null || value.isBlank() ? fallback : value.trim();
    }

    private String plural(int value, String singular, String plural) {
        return value == 1 ? singular : plural;
    }

    private ResponseStatusException badRequest(String message) {
        return new ResponseStatusException(HttpStatus.BAD_REQUEST, message);
    }
}
