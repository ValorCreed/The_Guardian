package com.vault.theguardian.continuitydrill;

import com.vault.theguardian.auth.AuthClient;
import com.vault.theguardian.auth.AuthenticatedUser;
import com.vault.theguardian.auth.InternalUserResponse;
import com.vault.theguardian.emergency.EmergencyContact;
import com.vault.theguardian.emergency.EmergencyContactRepository;
import com.vault.theguardian.email.ContinuityDrillEmailClient;
import com.vault.theguardian.estate.EstateActionType;
import com.vault.theguardian.estate.EstatePlaybook;
import com.vault.theguardian.estate.EstatePlaybookRepository;
import com.vault.theguardian.estate.EstatePlaybookStatus;
import com.vault.theguardian.estate.EstateTriggerType;
import com.vault.theguardian.notification.NotificationClient;
import com.vault.theguardian.recovery.RecoveryContinuityMember;
import com.vault.theguardian.recovery.RecoveryContinuityClient;
import com.vault.theguardian.recovery.RecoveryContinuitySnapshot;
import com.vault.theguardian.safetycheck.GuardianSafetyCheck;
import com.vault.theguardian.safetycheck.GuardianSafetyCheckRepository;
import com.vault.theguardian.safetycheck.SafetyCheckStatus;
import com.vault.theguardian.subscription.SubscriptionClient;
import com.vault.theguardian.subscription.SubscriptionEntitlements;
import com.vault.theguardian.vault.VaultClient;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.time.Duration;
import java.time.Instant;
import java.util.*;

@Service
public class ContinuityDrillService {
    private static final Duration DRILL_DURATION = Duration.ofHours(48);
    private static final int REACHABILITY_WEIGHT = 30;

    private final ContinuityDrillRepository drillRepository;
    private final ContinuityDrillCheckRepository checkRepository;
    private final ContinuityDrillParticipantRepository participantRepository;
    private final EmergencyContactRepository contactRepository;
    private final GuardianSafetyCheckRepository safetyCheckRepository;
    private final EstatePlaybookRepository estatePlaybookRepository;
    private final SubscriptionClient subscriptionClient;
    private final RecoveryContinuityClient recoveryContinuityClient;
    private final VaultClient vaultClient;
    private final AuthClient authClient;
    private final NotificationClient notificationClient;
    private final ContinuityDrillEmailClient emailClient;

    public ContinuityDrillService(
            ContinuityDrillRepository drillRepository,
            ContinuityDrillCheckRepository checkRepository,
            ContinuityDrillParticipantRepository participantRepository,
            EmergencyContactRepository contactRepository,
            GuardianSafetyCheckRepository safetyCheckRepository,
            EstatePlaybookRepository estatePlaybookRepository,
            SubscriptionClient subscriptionClient,
            RecoveryContinuityClient recoveryContinuityClient,
            VaultClient vaultClient,
            AuthClient authClient,
            NotificationClient notificationClient,
            ContinuityDrillEmailClient emailClient
    ) {
        this.drillRepository = drillRepository;
        this.checkRepository = checkRepository;
        this.participantRepository = participantRepository;
        this.contactRepository = contactRepository;
        this.safetyCheckRepository = safetyCheckRepository;
        this.estatePlaybookRepository = estatePlaybookRepository;
        this.subscriptionClient = subscriptionClient;
        this.recoveryContinuityClient = recoveryContinuityClient;
        this.vaultClient = vaultClient;
        this.authClient = authClient;
        this.notificationClient = notificationClient;
        this.emailClient = emailClient;
    }

    @Transactional
    public ContinuityOverviewResponse overview(AuthenticatedUser user) {
        Long userId = requireUser(user);
        expireVisibleDrills(userId, Instant.now());

        SubscriptionEntitlements entitlements = safeEntitlements(userId);
        boolean canRun = isFamily(entitlements);
        String plan = plan(entitlements);

        List<ContinuityDrill> owned = drillRepository
                .findTop5ByOwnerIdOrderByStartedAtDesc(userId);
        ContinuityDrill active = owned.stream()
                .filter(drill -> drill.getStatus() == ContinuityDrillStatus.RUNNING)
                .findFirst()
                .orElse(null);

        List<ContinuityIncomingRequestResponse> received = participantRepository
                .findTop50ByParticipantUserIdOrderByIdDesc(userId)
                .stream()
                .map(this::toIncomingResponse)
                .toList();

        String message;
        if (canRun) {
            message = active == null
                    ? "Run a safe continuity exercise without releasing any vault secrets."
                    : "Your drill is active. Trusted contacts can acknowledge the simulated notice.";
        } else if (entitlements == null) {
            message = "Guardian could not verify your subscription. Existing drill records and requests remain available.";
        } else {
            message = "Guardian Continuity Drill is included with the Family plan because it coordinates several trusted people.";
        }

        return new ContinuityOverviewResponse(
                plan,
                canRun,
                canRun,
                entitlements == null ? null : entitlements.expiresAt(),
                message,
                active == null ? null : toDrillResponse(active),
                owned.stream().map(this::toDrillResponse).toList(),
                received
        );
    }

    @Transactional
    public ContinuityDrillResponse start(AuthenticatedUser user) {
        Long ownerId = requireUser(user);
        SubscriptionEntitlements entitlements = subscriptionClient.getEntitlements(ownerId);
        requireFamily(entitlements);

        ContinuityDrill existing = drillRepository
                .findFirstByOwnerIdAndStatusOrderByStartedAtDesc(
                        ownerId,
                        ContinuityDrillStatus.RUNNING
                )
                .orElse(null);
        if (existing != null) {
            if (isExpired(existing, Instant.now())) {
                finish(existing, ContinuityDrillStatus.EXPIRED, Instant.now());
            } else {
                throw new ResponseStatusException(
                        HttpStatus.CONFLICT,
                        "Finish or cancel the current Continuity Drill before starting another."
                );
            }
        }

        InternalUserResponse owner = authClient.requireById(ownerId);
        Instant now = Instant.now();
        RecoveryContinuitySnapshot recovery = recoveryContinuityClient.getSnapshot(ownerId);
        List<EmergencyContact> contacts = contactRepository
                .findByOwnerIdOrderByCreatedAtDesc(ownerId);
        Map<Long, EmergencyContact> candidateContacts = contacts.stream()
                .filter(this::isRegisteredActiveContact)
                .collect(
                        LinkedHashMap::new,
                        (map, contact) -> map.putIfAbsent(contact.getContactUserId(), contact),
                        LinkedHashMap::putAll
                );
        Map<Long, InternalUserResponse> trustedUsers = authClient
                .findByIds(candidateContacts.keySet())
                .stream()
                .filter(account -> account.id() != null)
                .filter(account -> account.email() != null && !account.email().isBlank())
                .collect(
                        LinkedHashMap::new,
                        (map, account) -> map.putIfAbsent(account.id(), account),
                        LinkedHashMap::putAll
                );
        Map<Long, EmergencyContact> eligibleContacts = candidateContacts.entrySet()
                .stream()
                .filter(entry -> trustedUsers.containsKey(entry.getKey()))
                .collect(
                        LinkedHashMap::new,
                        (map, entry) -> map.put(entry.getKey(), entry.getValue()),
                        LinkedHashMap::putAll
                );

        List<EstatePlaybook> activePlaybooks = estatePlaybookRepository
                .findByOwnerIdAndStatusOrderByCreatedAtDesc(
                        ownerId,
                        EstatePlaybookStatus.ACTIVE
                );
        GuardianSafetyCheck safetyCheck = safetyCheckRepository
                .findByOwnerId(ownerId)
                .orElse(null);

        LinkedHashMap<Long, ParticipantSeed> participantSeeds = new LinkedHashMap<>();
        for (EmergencyContact contact : eligibleContacts.values()) {
            addParticipantRole(
                    participantSeeds,
                    contact,
                    trustedUsers.get(contact.getContactUserId()),
                    "Emergency contact"
            );
        }

        if (safetyCheck != null
                && (safetyCheck.getStatus() == SafetyCheckStatus.ACTIVE
                || safetyCheck.getStatus() == SafetyCheckStatus.GRACE)
                && safetyCheck.getContact() != null
                && eligibleContacts.containsKey(safetyCheck.getContact().getContactUserId())) {
            addParticipantRole(
                    participantSeeds,
                    safetyCheck.getContact(),
                    trustedUsers.get(safetyCheck.getContact().getContactUserId()),
                    "Safety Check contact"
            );
        }

        for (EstatePlaybook playbook : activePlaybooks) {
            EmergencyContact recipient = playbook.getRecipientContact();
            if (recipient != null
                    && eligibleContacts.containsKey(recipient.getContactUserId())) {
                addParticipantRole(
                        participantSeeds,
                        recipient,
                        trustedUsers.get(recipient.getContactUserId()),
                        "Estate Playbook recipient"
                );
            }
        }

        if (recovery.recoveryCircleActive()) {
            for (RecoveryContinuityMember member : recovery.members()) {
                EmergencyContact contact = eligibleContacts.get(member.userId());
                if (contact != null) {
                    addParticipantRole(
                            participantSeeds,
                            contact,
                            trustedUsers.get(contact.getContactUserId()),
                            "Recovery Circle member"
                    );
                }
            }
        }

        if (participantSeeds.isEmpty()) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST,
                    "Add at least one active emergency contact with a Guardian account before running a drill."
            );
        }

        List<CheckSeed> checks = buildChecks(
                ownerId,
                eligibleContacts,
                safetyCheck,
                activePlaybooks,
                recovery
        );
        int staticScore = checks.stream().mapToInt(CheckSeed::earnedPoints).sum();

        ContinuityDrill drill;
        try {
            drill = drillRepository.saveAndFlush(ContinuityDrill.builder()
                    .publicId(UUID.randomUUID().toString())
                    .ownerId(ownerId)
                    .ownerNameSnapshot(clean(owner.fullName(), owner.email()))
                    .ownerEmailSnapshot(clean(owner.email(), user.email()))
                    .planSnapshot("FAMILY")
                    .status(ContinuityDrillStatus.RUNNING)
                    .score(staticScore)
                    .staticScore(staticScore)
                    .startedAt(now)
                    .expiresAt(now.plus(DRILL_DURATION))
                    .version(0)
                    .build());
        } catch (DataIntegrityViolationException exception) {
            throw new ResponseStatusException(
                    HttpStatus.CONFLICT,
                    "A Continuity Drill is already running for this account.",
                    exception
            );
        }

        int order = 1;
        for (CheckSeed check : checks) {
            checkRepository.save(ContinuityDrillCheck.builder()
                    .drill(drill)
                    .checkCode(check.code())
                    .title(check.title())
                    .status(check.status())
                    .detail(check.detail())
                    .actionRoute(check.actionRoute())
                    .weight(check.weight())
                    .earnedPoints(check.earnedPoints())
                    .displayOrder(order++)
                    .build());
        }
        checkRepository.save(ContinuityDrillCheck.builder()
                .drill(drill)
                .checkCode("CONTACT_REACHABILITY")
                .title("Trusted-contact reachability")
                .status(ContinuityCheckStatus.FAIL)
                .detail("No trusted contact has acknowledged the simulated drill notice yet.")
                .actionRoute("/continuitydrill?tab=requests")
                .weight(REACHABILITY_WEIGHT)
                .earnedPoints(0)
                .displayOrder(order)
                .build());

        for (ParticipantSeed seed : participantSeeds.values()) {
            participantRepository.save(ContinuityDrillParticipant.builder()
                    .drill(drill)
                    .participantUserId(seed.userId())
                    .participantNameSnapshot(seed.name())
                    .participantEmailSnapshot(seed.email())
                    .rolesSnapshot(String.join(", ", seed.roles()))
                    .status(ContinuityParticipantStatus.PENDING)
                    .notifiedAt(now)
                    .version(0)
                    .build());
            notificationClient.notifyContinuityDrillAcknowledgementRequested(
                    seed.userId(),
                    drill.getOwnerNameSnapshot(),
                    String.join(", ", seed.roles())
            );
            emailClient.sendAcknowledgementRequestAfterCommit(
                    seed.email(),
                    drill.getOwnerNameSnapshot(),
                    String.join(", ", seed.roles()),
                    drill.getExpiresAt()
            );
        }

        notificationClient.notifyContinuityDrillStarted(
                ownerId,
                participantSeeds.size(),
                drill.getExpiresAt()
        );
        return toDrillResponse(drill);
    }

    @Transactional
    public ContinuityAcknowledgementResponse acknowledge(AuthenticatedUser user, String publicId) {
        Long participantUserId = requireUser(user);
        String normalizedPublicId = cleanRequired(publicId, "Drill id is required.");
        ContinuityDrill drill = drillRepository.findByPublicIdForUpdate(normalizedPublicId)
                .orElseThrow(() -> new ResponseStatusException(
                        HttpStatus.NOT_FOUND,
                        "Continuity Drill request not found."
                ));
        ContinuityDrillParticipant participant = participantRepository
                .findForAcknowledgement(normalizedPublicId, participantUserId)
                .orElseThrow(() -> new ResponseStatusException(
                        HttpStatus.NOT_FOUND,
                        "Continuity Drill request not found."
                ));
        Instant now = Instant.now();

        if (drill.getStatus() != ContinuityDrillStatus.RUNNING) {
            throw new ResponseStatusException(
                    HttpStatus.CONFLICT,
                    "This Continuity Drill is no longer accepting acknowledgements."
            );
        }
        if (isExpired(drill, now)) {
            finish(drill, ContinuityDrillStatus.EXPIRED, now);
            throw new ResponseStatusException(HttpStatus.GONE, "This Continuity Drill has expired.");
        }
        if (!isParticipantStillEligible(drill, participant)) {
            throw new ResponseStatusException(
                    HttpStatus.FORBIDDEN,
                    "You are no longer an active trusted contact for this account."
            );
        }
        if (participant.getStatus() == ContinuityParticipantStatus.ACKNOWLEDGED) {
            return acknowledgementResponse(
                    drill,
                    participant,
                    "This simulated notice was already acknowledged. No vault information was released."
            );
        }

        participant.setStatus(ContinuityParticipantStatus.ACKNOWLEDGED);
        participant.setAcknowledgedAt(now);
        participantRepository.save(participant);
        updateReachability(drill);

        notificationClient.notifyContinuityDrillAcknowledged(
                drill.getOwnerId(),
                participant.getParticipantNameSnapshot()
        );

        long total = participantRepository.countByDrillId(drill.getId());
        long acknowledged = participantRepository.countByDrillIdAndStatus(
                drill.getId(),
                ContinuityParticipantStatus.ACKNOWLEDGED
        );
        if (total > 0 && total == acknowledged) {
            finish(drill, ContinuityDrillStatus.COMPLETED, now);
        }

        return acknowledgementResponse(
                drill,
                participant,
                "Simulated notice acknowledged. No vault information was released."
        );
    }

    @Transactional
    public ContinuityDrillResponse complete(AuthenticatedUser user, Long drillId) {
        Long ownerId = requireUser(user);
        ContinuityDrill drill = requireOwnedRunningDrill(drillId, ownerId);
        finish(drill, ContinuityDrillStatus.COMPLETED, Instant.now());
        return toDrillResponse(drill);
    }

    @Transactional
    public ContinuityDrillResponse cancel(AuthenticatedUser user, Long drillId) {
        Long ownerId = requireUser(user);
        ContinuityDrill drill = requireOwnedRunningDrill(drillId, ownerId);
        finish(drill, ContinuityDrillStatus.CANCELLED, Instant.now());
        return toDrillResponse(drill);
    }

    public List<Long> findExpiredDrillIds(Instant now) {
        return drillRepository
                .findByStatusAndExpiresAtLessThanEqualOrderByExpiresAtAsc(
                        ContinuityDrillStatus.RUNNING,
                        now
                )
                .stream()
                .map(ContinuityDrill::getId)
                .toList();
    }

    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void expire(Long drillId, Instant now) {
        ContinuityDrill drill = drillRepository.findByIdForUpdate(drillId).orElse(null);
        if (drill == null || drill.getStatus() != ContinuityDrillStatus.RUNNING
                || !isExpired(drill, now)) {
            return;
        }
        finish(drill, ContinuityDrillStatus.EXPIRED, now);
    }

    private List<CheckSeed> buildChecks(
            Long ownerId,
            Map<Long, EmergencyContact> eligibleContacts,
            GuardianSafetyCheck safetyCheck,
            List<EstatePlaybook> activePlaybooks,
            RecoveryContinuitySnapshot recovery
    ) {
        List<CheckSeed> checks = new ArrayList<>();

        int activeRegisteredContacts = eligibleContacts.size();
        checks.add(activeRegisteredContacts >= 2
                ? pass("EMERGENCY_CONTACTS", "Trusted contacts", 10,
                activeRegisteredContacts + " active Guardian contacts are available.", "/emergencyaccess")
                : activeRegisteredContacts == 1
                ? warn("EMERGENCY_CONTACTS", "Trusted contacts", 10,
                "Only one active Guardian contact is available. Add a second contact to avoid a single point of failure.", "/emergencyaccess")
                : fail("EMERGENCY_CONTACTS", "Trusted contacts", 10,
                "No active emergency contact has a Guardian account.", "/emergencyaccess"));

        checks.add(safetyCheckCheck(ownerId, safetyCheck, eligibleContacts));

        long eligibleCircleMembers = recovery.members().stream()
                .map(RecoveryContinuityMember::userId)
                .filter(eligibleContacts::containsKey)
                .distinct()
                .count();
        if (recovery.recoveryCircleActive()
                && recovery.approvalThreshold() >= 2
                && eligibleCircleMembers >= recovery.approvalThreshold()) {
            checks.add(pass(
                    "RECOVERY_CIRCLE",
                    "Recovery Circle",
                    20,
                    eligibleCircleMembers + " eligible members can satisfy the "
                            + recovery.approvalThreshold() + "-approval threshold.",
                    "/recoverycircle"
            ));
        } else if (recovery.recoveryCircleConfigured()) {
            checks.add(fail(
                    "RECOVERY_CIRCLE",
                    "Recovery Circle",
                    20,
                    "The Recovery Circle exists, but it is inactive or its eligible members cannot satisfy the approval threshold.",
                    "/recoverycircle"
            ));
        } else {
            checks.add(fail(
                    "RECOVERY_CIRCLE",
                    "Recovery Circle",
                    20,
                    "No Recovery Circle is configured.",
                    "/recoverycircle"
            ));
        }

        checks.add(recovery.recoveryKitActive()
                ? pass("RECOVERY_KIT", "Recovery Kit", 10,
                "An active Recovery Kit is available.", "/recoverykit")
                : fail("RECOVERY_KIT", "Recovery Kit", 10,
                "No active Recovery Kit is available.", "/recoverykit"));

        checks.add(estatePlaybookCheck(ownerId, activePlaybooks, eligibleContacts));
        return checks;
    }

    private CheckSeed safetyCheckCheck(
            Long ownerId,
            GuardianSafetyCheck safetyCheck,
            Map<Long, EmergencyContact> eligibleContacts
    ) {
        if (safetyCheck == null) {
            return fail(
                    "SAFETY_CHECK",
                    "Guardian Safety Check",
                    15,
                    "Safety Check has not been configured.",
                    "/safetycheck"
            );
        }

        EmergencyContact contact = safetyCheck.getContact();
        boolean contactEligible = contact != null
                && eligibleContacts.containsKey(contact.getContactUserId());
        boolean releaseScope = contactEligible && hasSafetyReleaseScope(ownerId, contact);

        if (safetyCheck.getStatus() == SafetyCheckStatus.ACTIVE
                && contactEligible && releaseScope) {
            return pass(
                    "SAFETY_CHECK",
                    "Guardian Safety Check",
                    15,
                    "Safety Check is active with an eligible release contact and scope.",
                    "/safetycheck"
            );
        }
        if (safetyCheck.getStatus() == SafetyCheckStatus.GRACE
                && contactEligible && releaseScope) {
            return warn(
                    "SAFETY_CHECK",
                    "Guardian Safety Check",
                    15,
                    "Safety Check is in its grace period. Check in immediately before relying on this drill result.",
                    "/safetycheck"
            );
        }
        return fail(
                "SAFETY_CHECK",
                "Guardian Safety Check",
                15,
                "Safety Check is disabled, already triggered, or no longer has an eligible release path.",
                "/safetycheck"
        );
    }

    private CheckSeed estatePlaybookCheck(
            Long ownerId,
            List<EstatePlaybook> playbooks,
            Map<Long, EmergencyContact> eligibleContacts
    ) {
        if (playbooks.isEmpty()) {
            return warn(
                    "ESTATE_PLAYBOOKS",
                    "Digital Estate Playbooks",
                    15,
                    "No active estate playbook exists. Add one if trusted people need item-specific instructions.",
                    "/estateplaybooks"
            );
        }

        Set<String> availableItems = new HashSet<>();
        playbooks.stream()
                .map(EstatePlaybook::getItemType)
                .filter(Objects::nonNull)
                .map(type -> type.trim().toUpperCase(Locale.ROOT))
                .distinct()
                .forEach(type -> vaultClient.list(ownerId, type).forEach(item ->
                        availableItems.add(vaultKey(item.itemType(), item.id()))
                ));

        int invalid = 0;
        for (EstatePlaybook playbook : playbooks) {
            if (!availableItems.contains(vaultKey(
                    playbook.getItemType(),
                    playbook.getItemId()
            ))) {
                invalid++;
                continue;
            }
            if (playbook.getActionType() != EstateActionType.NEVER_RELEASE) {
                EmergencyContact recipient = playbook.getRecipientContact();
                if (recipient == null
                        || !eligibleContacts.containsKey(recipient.getContactUserId())) {
                    invalid++;
                }
            }
        }

        if (invalid == 0) {
            return pass(
                    "ESTATE_PLAYBOOKS",
                    "Digital Estate Playbooks",
                    15,
                    playbooks.size() + " active playbook"
                            + (playbooks.size() == 1 ? " has" : "s have")
                            + " a valid item and release configuration.",
                    "/estateplaybooks"
            );
        }
        return fail(
                "ESTATE_PLAYBOOKS",
                "Digital Estate Playbooks",
                15,
                invalid + " active playbook" + (invalid == 1 ? " has" : "s have")
                        + " a missing item or ineligible recipient.",
                "/estateplaybooks"
        );
    }

    private void updateReachability(ContinuityDrill drill) {
        List<ContinuityDrillCheck> checks = checkRepository
                .findByDrillIdOrderByDisplayOrderAsc(drill.getId());
        ContinuityDrillCheck reachability = checks.stream()
                .filter(check -> "CONTACT_REACHABILITY".equals(check.getCheckCode()))
                .findFirst()
                .orElseThrow(() -> new IllegalStateException(
                        "Continuity Drill reachability check is missing."
                ));

        List<ContinuityDrillParticipant> participants = participantRepository
                .findByDrillIdOrderByParticipantNameSnapshotAsc(drill.getId());
        long total = participants.size();
        long acknowledgedAndEligible = participants.stream()
                .filter(participant -> participant.getStatus()
                        == ContinuityParticipantStatus.ACKNOWLEDGED)
                .filter(participant -> isParticipantStillEligible(drill, participant))
                .count();
        int earned = total == 0
                ? 0
                : (int) Math.round(
                (double) REACHABILITY_WEIGHT * acknowledgedAndEligible / total
        );

        reachability.setEarnedPoints(earned);
        if (total > 0 && acknowledgedAndEligible == total) {
            reachability.setStatus(ContinuityCheckStatus.PASS);
            reachability.setDetail(
                    "Every original trusted contact acknowledged the simulated notice and remains eligible."
            );
        } else if (acknowledgedAndEligible > 0) {
            reachability.setStatus(ContinuityCheckStatus.WARN);
            reachability.setDetail(acknowledgedAndEligible + " of " + total
                    + " original trusted contacts acknowledged and remain eligible.");
        } else {
            reachability.setStatus(ContinuityCheckStatus.FAIL);
            reachability.setDetail(
                    "No original trusted contact both acknowledged the notice and remains eligible."
            );
        }
        checkRepository.save(reachability);
        drill.setScore(Math.min(100, drill.getStaticScore() + earned));
        drillRepository.save(drill);
    }

    private void finish(
            ContinuityDrill drill,
            ContinuityDrillStatus finalStatus,
            Instant now
    ) {
        if (drill.getStatus() != ContinuityDrillStatus.RUNNING) return;
        updateReachability(drill);
        drill.setStatus(finalStatus);
        if (finalStatus == ContinuityDrillStatus.CANCELLED) {
            drill.setCancelledAt(now);
        } else {
            drill.setCompletedAt(now);
        }
        drillRepository.save(drill);

        if (finalStatus == ContinuityDrillStatus.COMPLETED) {
            notificationClient.notifyContinuityDrillCompleted(drill.getOwnerId(), drill.getScore());
        } else if (finalStatus == ContinuityDrillStatus.EXPIRED) {
            notificationClient.notifyContinuityDrillExpired(drill.getOwnerId(), drill.getScore());
        } else if (finalStatus == ContinuityDrillStatus.CANCELLED) {
            notificationClient.notifyContinuityDrillCancelled(drill.getOwnerId());
        }
    }

    private ContinuityDrill requireOwnedRunningDrill(Long drillId, Long ownerId) {
        ContinuityDrill drill = drillRepository
                .findByIdAndOwnerIdForUpdate(drillId, ownerId)
                .orElseThrow(() -> new ResponseStatusException(
                        HttpStatus.NOT_FOUND,
                        "Continuity Drill not found."
                ));
        if (drill.getStatus() != ContinuityDrillStatus.RUNNING) {
            throw new ResponseStatusException(
                    HttpStatus.CONFLICT,
                    "This Continuity Drill is already closed."
            );
        }
        if (isExpired(drill, Instant.now())) {
            finish(drill, ContinuityDrillStatus.EXPIRED, Instant.now());
            throw new ResponseStatusException(HttpStatus.GONE, "This Continuity Drill has expired.");
        }
        return drill;
    }

    private void expireVisibleDrills(Long userId, Instant now) {
        drillRepository.findFirstByOwnerIdAndStatusOrderByStartedAtDesc(
                        userId,
                        ContinuityDrillStatus.RUNNING
                ).filter(drill -> isExpired(drill, now))
                .map(drill -> drillRepository.findByIdForUpdate(drill.getId()).orElse(null))
                .filter(Objects::nonNull)
                .ifPresent(drill -> finish(drill, ContinuityDrillStatus.EXPIRED, now));

        participantRepository.findExpiredDrillIdsForParticipant(
                        userId,
                        ContinuityDrillStatus.RUNNING,
                        now
                )
                .stream()
                .map(drillRepository::findByIdForUpdate)
                .flatMap(Optional::stream)
                .filter(drill -> drill.getStatus() == ContinuityDrillStatus.RUNNING)
                .filter(drill -> isExpired(drill, now))
                .forEach(drill -> finish(drill, ContinuityDrillStatus.EXPIRED, now));
    }

    private ContinuityAcknowledgementResponse acknowledgementResponse(
            ContinuityDrill drill,
            ContinuityDrillParticipant participant,
            String message
    ) {
        return new ContinuityAcknowledgementResponse(
                drill.getPublicId(),
                participant.getStatus(),
                participant.getAcknowledgedAt(),
                message
        );
    }

    private ContinuityDrillResponse toDrillResponse(ContinuityDrill drill) {
        List<ContinuityDrillCheck> checks = checkRepository
                .findByDrillIdOrderByDisplayOrderAsc(drill.getId());
        List<ContinuityDrillParticipant> participants = participantRepository
                .findByDrillIdOrderByParticipantNameSnapshotAsc(drill.getId());
        boolean running = drill.getStatus() == ContinuityDrillStatus.RUNNING;
        int acknowledged = (int) participants.stream()
                .filter(participant -> participant.getStatus()
                        == ContinuityParticipantStatus.ACKNOWLEDGED)
                .filter(participant -> !running || isParticipantStillEligible(drill, participant))
                .count();

        return new ContinuityDrillResponse(
                drill.getId(),
                drill.getPublicId(),
                drill.getStatus().name(),
                drill.getScore(),
                drill.getStaticScore(),
                acknowledged,
                participants.size(),
                drill.getStartedAt(),
                drill.getExpiresAt(),
                drill.getCompletedAt(),
                drill.getCancelledAt(),
                drill.getStatus() == ContinuityDrillStatus.RUNNING,
                drill.getStatus() == ContinuityDrillStatus.RUNNING,
                checks.stream().map(this::toCheckResponse).toList(),
                participants.stream().map(this::toParticipantResponse).toList()
        );
    }

    private ContinuityIncomingRequestResponse toIncomingResponse(
            ContinuityDrillParticipant participant
    ) {
        ContinuityDrill drill = participant.getDrill();
        boolean canAcknowledge = drill.getStatus() == ContinuityDrillStatus.RUNNING
                && !isExpired(drill, Instant.now())
                && participant.getStatus() == ContinuityParticipantStatus.PENDING
                && isParticipantStillEligible(drill, participant);
        return new ContinuityIncomingRequestResponse(
                drill.getPublicId(),
                drill.getOwnerNameSnapshot(),
                drill.getOwnerEmailSnapshot(),
                participant.getRolesSnapshot(),
                participant.getStatus().name(),
                drill.getStartedAt(),
                drill.getExpiresAt(),
                participant.getAcknowledgedAt(),
                canAcknowledge
        );
    }

    private ContinuityCheckResponse toCheckResponse(ContinuityDrillCheck check) {
        return new ContinuityCheckResponse(
                check.getCheckCode(),
                check.getTitle(),
                check.getStatus().name(),
                check.getDetail(),
                check.getActionRoute(),
                check.getWeight(),
                check.getEarnedPoints()
        );
    }

    private ContinuityParticipantResponse toParticipantResponse(
            ContinuityDrillParticipant participant
    ) {
        return new ContinuityParticipantResponse(
                participant.getParticipantUserId(),
                participant.getParticipantNameSnapshot(),
                participant.getParticipantEmailSnapshot(),
                participant.getRolesSnapshot(),
                participant.getStatus().name(),
                participant.getDrill().getStatus() != ContinuityDrillStatus.RUNNING
                        || isParticipantStillEligible(participant.getDrill(), participant),
                participant.getNotifiedAt(),
                participant.getAcknowledgedAt()
        );
    }

    private void addParticipantRole(
            Map<Long, ParticipantSeed> seeds,
            EmergencyContact contact,
            InternalUserResponse trustedUser,
            String role
    ) {
        if (!isRegisteredActiveContact(contact)
                || trustedUser == null
                || trustedUser.id() == null
                || !trustedUser.id().equals(contact.getContactUserId())) {
            return;
        }
        ParticipantSeed existing = seeds.get(trustedUser.id());
        if (existing == null) {
            LinkedHashSet<String> roles = new LinkedHashSet<>();
            roles.add(role);
            seeds.put(trustedUser.id(), new ParticipantSeed(
                    trustedUser.id(),
                    clean(trustedUser.fullName(), trustedUser.email()),
                    clean(trustedUser.email(), "Guardian contact"),
                    roles
            ));
            return;
        }
        existing.roles().add(role);
    }

    private String vaultKey(String itemType, Long itemId) {
        String normalizedType = itemType == null
                ? ""
                : itemType.trim().toUpperCase(Locale.ROOT);
        return normalizedType + ":" + itemId;
    }

    private boolean hasSafetyReleaseScope(Long ownerId, EmergencyContact contact) {
        boolean broadScope = contact.isAllowPasswords()
                || contact.isAllowCards()
                || contact.isAllowDocuments()
                || contact.isAllowNotes();
        return broadScope || estatePlaybookRepository
                .existsByOwnerIdAndTriggerTypeAndRecipientContact_IdAndStatus(
                        ownerId,
                        EstateTriggerType.SAFETY_CHECK,
                        contact.getId(),
                        EstatePlaybookStatus.ACTIVE
                );
    }

    private boolean isParticipantStillEligible(
            ContinuityDrill drill,
            ContinuityDrillParticipant participant
    ) {
        return participant.getParticipantUserId() != null
                && contactRepository.existsByOwnerIdAndContactUserIdAndActiveTrue(
                drill.getOwnerId(),
                participant.getParticipantUserId()
        );
    }

    private boolean isRegisteredActiveContact(EmergencyContact contact) {
        return contact != null && contact.isActive() && contact.getContactUserId() != null;
    }

    private SubscriptionEntitlements safeEntitlements(Long userId) {
        try {
            return subscriptionClient.getEntitlements(userId);
        } catch (ResponseStatusException exception) {
            if (exception.getStatusCode().value() == 503) return null;
            throw exception;
        }
    }

    private void requireFamily(SubscriptionEntitlements entitlements) {
        if (!isFamily(entitlements)) {
            throw new ResponseStatusException(
                    HttpStatus.FORBIDDEN,
                    "Guardian Continuity Drill is available on the Family plan."
            );
        }
    }

    private boolean isFamily(SubscriptionEntitlements entitlements) {
        return entitlements != null
                && entitlements.active()
                && "FAMILY".equalsIgnoreCase(entitlements.plan())
                && entitlements.canUseContinuityDrill();
    }

    private String plan(SubscriptionEntitlements entitlements) {
        if (entitlements == null) return "UNKNOWN";
        if (!entitlements.active()) return "FREE";
        String value = clean(entitlements.plan(), "FREE").toUpperCase(Locale.ROOT);
        return Set.of("FREE", "PREMIUM", "FAMILY").contains(value) ? value : "FREE";
    }

    private Long requireUser(AuthenticatedUser user) {
        if (user == null || user.id() == null) {
            throw new ResponseStatusException(
                    HttpStatus.UNAUTHORIZED,
                    "Authenticated user could not be resolved."
            );
        }
        return user.id();
    }

    private boolean isExpired(ContinuityDrill drill, Instant now) {
        return drill.getExpiresAt() != null && !drill.getExpiresAt().isAfter(now);
    }

    private CheckSeed pass(String code, String title, int weight, String detail, String route) {
        return new CheckSeed(code, title, ContinuityCheckStatus.PASS, detail, route, weight, weight);
    }

    private CheckSeed warn(String code, String title, int weight, String detail, String route) {
        return new CheckSeed(
                code,
                title,
                ContinuityCheckStatus.WARN,
                detail,
                route,
                weight,
                weight / 2
        );
    }

    private CheckSeed fail(String code, String title, int weight, String detail, String route) {
        return new CheckSeed(code, title, ContinuityCheckStatus.FAIL, detail, route, weight, 0);
    }

    private String clean(String value, String fallback) {
        return value == null || value.isBlank() ? fallback : value.trim();
    }

    private String cleanRequired(String value, String message) {
        if (value == null || value.isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, message);
        }
        return value.trim();
    }

    private record CheckSeed(
            String code,
            String title,
            ContinuityCheckStatus status,
            String detail,
            String actionRoute,
            int weight,
            int earnedPoints
    ) {}

    private record ParticipantSeed(
            Long userId,
            String name,
            String email,
            LinkedHashSet<String> roles
    ) {}
}