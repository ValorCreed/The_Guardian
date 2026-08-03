package com.vault.theguardian.estate;

import com.vault.theguardian.auth.AuthClient;
import com.vault.theguardian.auth.AuthenticatedUser;
import com.vault.theguardian.auth.InternalUserResponse;
import com.vault.theguardian.emergency.EmergencyContact;
import com.vault.theguardian.emergency.EmergencyContactRepository;
import com.vault.theguardian.notification.NotificationClient;
import com.vault.theguardian.subscription.SubscriptionClient;
import com.vault.theguardian.subscription.SubscriptionEntitlements;
import com.vault.theguardian.vault.DownloadedDocument;
import com.vault.theguardian.vault.InternalVaultItemResponse;
import com.vault.theguardian.vault.VaultClient;
import jakarta.transaction.Transactional;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

import java.time.Instant;
import java.util.*;
import java.util.stream.Collectors;

@Service
@Transactional
public class EstatePlaybookService {
    private static final Logger log = LoggerFactory.getLogger(EstatePlaybookService.class);
    private static final Set<String> ITEM_TYPES = Set.of("PASSWORD", "CARD", "DOCUMENT", "NOTE");
    private static final List<EstatePlaybookStatus> LIVE_STATUSES = List.of(
            EstatePlaybookStatus.ACTIVE,
            EstatePlaybookStatus.PAUSED
    );
    private static final List<EstateExecutionStatus> NON_CANCELLED_EXECUTIONS = List.of(
            EstateExecutionStatus.RELEASED,
            EstateExecutionStatus.VIEWED,
            EstateExecutionStatus.COMPLETED
    );
    private static final int MAX_PLAYBOOKS = 50;

    private final EstatePlaybookRepository playbookRepository;
    private final EstatePlaybookExecutionRepository executionRepository;
    private final EmergencyContactRepository contactRepository;
    private final SubscriptionClient subscriptionClient;
    private final VaultClient vaultClient;
    private final AuthClient authClient;
    private final NotificationClient notificationClient;
    private final EstateInstructionCryptoService cryptoService;

    public EstatePlaybookService(
            EstatePlaybookRepository playbookRepository,
            EstatePlaybookExecutionRepository executionRepository,
            EmergencyContactRepository contactRepository,
            SubscriptionClient subscriptionClient,
            VaultClient vaultClient,
            AuthClient authClient,
            NotificationClient notificationClient,
            EstateInstructionCryptoService cryptoService
    ) {
        this.playbookRepository = playbookRepository;
        this.executionRepository = executionRepository;
        this.contactRepository = contactRepository;
        this.subscriptionClient = subscriptionClient;
        this.vaultClient = vaultClient;
        this.authClient = authClient;
        this.notificationClient = notificationClient;
        this.cryptoService = cryptoService;
    }

    public EstateOverviewResponse getOverview(AuthenticatedUser user) {
        List<EstatePlaybook> playbooks = playbookRepository
                .findByOwnerIdAndStatusNotOrderByCreatedAtDesc(
                        user.id(),
                        EstatePlaybookStatus.ARCHIVED
                );
        List<EstatePlaybookExecution> releasedByMe = executionRepository
                .findByOwnerIdOrderByReleasedAtDesc(user.id());
        List<EstatePlaybookExecution> received = executionRepository
                .findByRecipientUserIdOrderByReleasedAtDesc(user.id());

        SubscriptionEntitlements entitlements = tryGetEntitlements(user.id());
        boolean canConfigure = isEligible(entitlements);
        boolean eligible = canConfigure
                || !playbooks.isEmpty()
                || !releasedByMe.isEmpty()
                || !received.isEmpty();

        VaultItemsResult vaultItemsResult = tryListVaultItems(user.id());
        List<EstateVaultItemOption> vaultItems = vaultItemsResult.items();
        Set<String> ownerItemKeys = vaultItems.stream()
                .map(item -> itemKey(user.id(), item.itemType(), item.id()))
                .collect(Collectors.toSet());

        Map<String, Boolean> availability = new HashMap<>();
        ownerItemKeys.forEach(key -> availability.put(key, true));

        Set<Long> ownerIds = new HashSet<>();
        releasedByMe.forEach(item -> ownerIds.add(item.getOwnerId()));
        received.forEach(item -> ownerIds.add(item.getOwnerId()));
        Map<Long, InternalUserResponse> owners = usersById(ownerIds);

        return new EstateOverviewResponse(
                plan(entitlements),
                eligible,
                canConfigure,
                vaultItemsResult.available(),
                contactOptions(user.id()),
                vaultItems,
                playbooks.stream()
                        .map(playbook -> toPlaybookResponse(
                                playbook,
                                !vaultItemsResult.available() || ownerItemKeys.contains(itemKey(
                                        user.id(),
                                        playbook.getItemType(),
                                        playbook.getItemId()
                                ))
                        ))
                        .toList(),
                releasedByMe.stream()
                        .limit(50)
                        .map(execution -> toExecutionResponse(
                                execution,
                                owners.get(execution.getOwnerId()),
                                true,
                                true,
                                available(execution, availability)
                        ))
                        .toList(),
                received.stream()
                        .limit(50)
                        .map(execution -> toExecutionResponse(
                                execution,
                                owners.get(execution.getOwnerId()),
                                false,
                                false,
                                recipientStillEligible(execution, user.id())
                                        && available(execution, availability)
                        ))
                        .toList(),
                canConfigure
                        ? "Create clear, controlled instructions for your digital estate."
                        : eligible
                        ? "Existing playbooks remain visible. Premium or Family is required to change their configuration."
                        : "Digital Estate Playbooks are available on Premium and Family plans."
        );
    }

    public EstatePlaybookResponse create(
            AuthenticatedUser owner,
            EstatePlaybookRequest request
    ) {
        requireEligiblePlan(owner.id());

        long count = playbookRepository
                .findByOwnerIdAndStatusNotOrderByCreatedAtDesc(
                        owner.id(),
                        EstatePlaybookStatus.ARCHIVED
                )
                .size();
        if (count >= MAX_PLAYBOOKS) {
            throw new ResponseStatusException(
                    HttpStatus.CONFLICT,
                    "You can keep up to 50 active or paused estate playbooks. Archive one before creating another."
            );
        }

        Definition definition = validateDefinition(owner.id(), request, null);
        Instant now = Instant.now();

        EstatePlaybook playbook = EstatePlaybook.builder()
                .ownerId(owner.id())
                .recipientContact(definition.contact())
                .itemType(definition.itemType())
                .itemId(definition.item().id())
                .itemTitleSnapshot(itemTitle(definition.item()))
                .actionType(definition.actionType())
                .triggerType(definition.triggerType())
                .encryptedInstructions(cryptoService.encrypt(definition.instructions()))
                .status(EstatePlaybookStatus.ACTIVE)
                .createdAt(now)
                .updatedAt(now)
                .version(0)
                .build();

        try {
            EstatePlaybook saved = playbookRepository.saveAndFlush(playbook);
            notificationClient.notifyEstatePlaybookCreated(
                    owner.id(),
                    saved.getItemTitleSnapshot(),
                    saved.getActionType().name()
            );
            return toPlaybookResponse(saved, true);
        } catch (DataIntegrityViolationException exception) {
            throw duplicateDefinition(exception);
        }
    }

    public EstatePlaybookResponse update(
            AuthenticatedUser owner,
            Long id,
            EstatePlaybookRequest request
    ) {
        requireEligiblePlan(owner.id());
        EstatePlaybook playbook = requireOwnedPlaybook(owner.id(), id);
        requireNotArchived(playbook);

        Definition definition = validateDefinition(owner.id(), request, id);
        playbook.setRecipientContact(definition.contact());
        playbook.setItemType(definition.itemType());
        playbook.setItemId(definition.item().id());
        playbook.setItemTitleSnapshot(itemTitle(definition.item()));
        playbook.setActionType(definition.actionType());
        playbook.setTriggerType(definition.triggerType());
        playbook.setEncryptedInstructions(cryptoService.encrypt(definition.instructions()));
        playbook.setUpdatedAt(Instant.now());

        try {
            EstatePlaybook saved = playbookRepository.saveAndFlush(playbook);
            notificationClient.notifyEstatePlaybookUpdated(
                    owner.id(),
                    saved.getItemTitleSnapshot()
            );
            return toPlaybookResponse(saved, true);
        } catch (DataIntegrityViolationException exception) {
            throw duplicateDefinition(exception);
        }
    }

    public void archive(AuthenticatedUser owner, Long id) {
        EstatePlaybook playbook = requireOwnedPlaybook(owner.id(), id);
        if (playbook.getStatus() == EstatePlaybookStatus.ARCHIVED) return;

        playbook.setStatus(EstatePlaybookStatus.ARCHIVED);
        playbook.setUpdatedAt(Instant.now());
        playbookRepository.save(playbook);
        notificationClient.notifyEstatePlaybookArchived(
                owner.id(),
                playbook.getItemTitleSnapshot()
        );
    }

    public EstatePlaybookResponse setActive(
            AuthenticatedUser owner,
            Long id,
            boolean active
    ) {
        EstatePlaybook playbook = requireOwnedPlaybook(owner.id(), id);
        requireNotArchived(playbook);

        if (active) {
            requireEligiblePlan(owner.id());
            validateStoredDefinition(playbook, false);
            ensureNoDuplicate(playbook, playbook.getId());
        }

        playbook.setStatus(active
                ? EstatePlaybookStatus.ACTIVE
                : EstatePlaybookStatus.PAUSED);
        playbook.setUpdatedAt(Instant.now());
        EstatePlaybook saved = playbookRepository.save(playbook);

        return toPlaybookResponse(
                saved,
                vaultClient.getOrNull(
                        owner.id(),
                        saved.getItemType(),
                        saved.getItemId()
                ) != null
        );
    }

    public EstateExecutionResponse releaseNow(
            AuthenticatedUser owner,
            Long playbookId
    ) {
        requireEligiblePlan(owner.id());
        EstatePlaybook playbook = requireOwnedPlaybook(owner.id(), playbookId);
        validateStoredDefinition(playbook, true);

        if (playbook.getActionType() == EstateActionType.NEVER_RELEASE) {
            throw badRequest("A Never release rule cannot be released to a recipient.");
        }

        executionRepository
                .findFirstByPlaybook_IdAndStatusInOrderByReleasedAtDesc(
                        playbook.getId(),
                        NON_CANCELLED_EXECUTIONS
                )
                .ifPresent(existing -> {
                    throw new ResponseStatusException(
                            HttpStatus.CONFLICT,
                            "This playbook has already been released. Archive it and create a new playbook if another release is required."
                    );
                });

        InternalVaultItemResponse item = vaultClient.get(
                owner.id(),
                playbook.getItemType(),
                playbook.getItemId()
        );
        EstatePlaybookExecution saved = createExecution(
                playbook,
                item,
                EstateExecutionSource.OWNER_RELEASE,
                null
        );
        InternalUserResponse ownerUser = authClient.requireById(owner.id());

        return toExecutionResponse(saved, ownerUser, true, true, true);
    }

    public EstateExecutionResponse cancelExecution(
            AuthenticatedUser owner,
            Long executionId
    ) {
        EstatePlaybookExecution execution = executionRepository
                .findByIdAndOwnerId(executionId, owner.id())
                .orElseThrow(() -> notFound("Released playbook"));

        if (execution.getStatus() != EstateExecutionStatus.RELEASED
                || execution.getViewedAt() != null) {
            throw new ResponseStatusException(
                    HttpStatus.CONFLICT,
                    "A playbook can be cancelled only before the recipient opens it."
            );
        }

        execution.setStatus(EstateExecutionStatus.CANCELLED);
        execution.setCancelledAt(Instant.now());
        EstatePlaybookExecution saved = executionRepository.save(execution);
        notificationClient.notifyEstatePlaybookCancelled(
                saved.getRecipientUserId(),
                saved.getItemTitleSnapshot()
        );

        return toExecutionResponse(
                saved,
                authClient.requireById(owner.id()),
                true,
                true,
                available(saved, new HashMap<>())
        );
    }

    public EstateExecutionResponse completeExecution(
            AuthenticatedUser recipient,
            Long executionId
    ) {
        EstatePlaybookExecution execution = requireRecipientExecution(
                recipient,
                executionId
        );

        if (execution.getStatus() == EstateExecutionStatus.CANCELLED) {
            throw forbidden("This estate playbook was cancelled by the owner.");
        }
        if (execution.getStatus() == EstateExecutionStatus.COMPLETED) {
            return toExecutionResponse(
                    execution,
                    authClient.requireById(execution.getOwnerId()),
                    false,
                    false,
                    available(execution, new HashMap<>())
            );
        }
        if (execution.getStatus() != EstateExecutionStatus.VIEWED
                || execution.getViewedAt() == null) {
            throw new ResponseStatusException(
                    HttpStatus.CONFLICT,
                    "Open the released item and instructions before marking the Guardian task complete."
            );
        }

        execution.setStatus(EstateExecutionStatus.COMPLETED);
        execution.setCompletedAt(Instant.now());
        EstatePlaybookExecution saved = executionRepository.save(execution);
        notificationClient.notifyEstatePlaybookCompleted(
                saved.getOwnerId(),
                saved.getRecipientEmailSnapshot(),
                saved.getItemTitleSnapshot()
        );

        return toExecutionResponse(
                saved,
                authClient.requireById(saved.getOwnerId()),
                false,
                false,
                available(saved, new HashMap<>())
        );
    }

    public EstateReleasedItemResponse getReleasedItem(
            AuthenticatedUser recipient,
            Long executionId
    ) {
        EstatePlaybookExecution execution = requireRecipientExecution(
                recipient,
                executionId
        );
        InternalVaultItemResponse item = requireReleasedItem(execution);
        markViewed(execution);
        InternalUserResponse owner = authClient.requireById(execution.getOwnerId());
        return toReleasedItem(execution, item, owner);
    }

    public DownloadedDocument downloadReleasedDocument(
            AuthenticatedUser recipient,
            Long executionId
    ) {
        EstatePlaybookExecution execution = requireRecipientExecution(
                recipient,
                executionId
        );
        if (!"DOCUMENT".equals(execution.getItemTypeSnapshot())) {
            throw badRequest("This released playbook does not contain a document.");
        }
        requireReleasedItem(execution);
        DownloadedDocument document = vaultClient.downloadDocument(
                execution.getOwnerId(),
                execution.getItemIdSnapshot()
        );
        markViewed(execution);
        return document;
    }

    public void releaseForEmergencyApproval(
            Long ownerId,
            EmergencyContact contact,
            Long requestId
    ) {
        releaseForTrigger(
                ownerId,
                contact,
                EstateTriggerType.EMERGENCY_APPROVAL,
                EstateExecutionSource.EMERGENCY_REQUEST,
                requestId
        );
    }

    public int releaseForSafetyCheck(
            Long ownerId,
            EmergencyContact contact,
            Long cycleReference
    ) {
        return releaseForTrigger(
                ownerId,
                contact,
                EstateTriggerType.SAFETY_CHECK,
                EstateExecutionSource.SAFETY_CHECK,
                cycleReference
        );
    }

    public boolean hasActiveSafetyCheckPlaybooksForContact(
            Long ownerId,
            Long contactId
    ) {
        return ownerId != null
                && contactId != null
                && playbookRepository
                .existsByOwnerIdAndTriggerTypeAndRecipientContact_IdAndStatus(
                        ownerId,
                        EstateTriggerType.SAFETY_CHECK,
                        contactId,
                        EstatePlaybookStatus.ACTIVE
                );
    }

    public boolean isNeverRelease(Long ownerId, String itemType, Long itemId) {
        return playbookRepository
                .existsByOwnerIdAndItemTypeAndItemIdAndActionTypeAndStatus(
                        ownerId,
                        normalizeItemType(itemType),
                        itemId,
                        EstateActionType.NEVER_RELEASE,
                        EstatePlaybookStatus.ACTIVE
                );
    }

    public boolean hasAnyEstateHistoryForContact(Long contactId) {
        return contactId != null
                && (playbookRepository.existsByRecipientContact_Id(contactId)
                || executionRepository.existsByRecipientContact_Id(contactId));
    }

    public boolean contactChangeInvalidatesLivePlaybooks(EmergencyContact contact) {
        if (contact == null || contact.getId() == null) return false;

        List<EstatePlaybook> playbooks = playbookRepository
                .findByRecipientContact_IdAndStatusNot(
                        contact.getId(),
                        EstatePlaybookStatus.ARCHIVED
                );
        if (playbooks.isEmpty()) return false;
        return !contact.isActive() || contact.getContactUserId() == null;
    }

    private int releaseForTrigger(
            Long ownerId,
            EmergencyContact contact,
            EstateTriggerType triggerType,
            EstateExecutionSource sourceType,
            Long sourceReferenceId
    ) {
        if (ownerId == null
                || contact == null
                || contact.getId() == null
                || sourceReferenceId == null
                || !contact.isActive()
                || contact.getContactUserId() == null) {
            return 0;
        }

        List<EstatePlaybook> playbooks = playbookRepository
                .findByOwnerIdAndTriggerTypeAndRecipientContact_IdAndStatus(
                        ownerId,
                        triggerType,
                        contact.getId(),
                        EstatePlaybookStatus.ACTIVE
                );

        int releasedCount = 0;
        for (EstatePlaybook playbook : playbooks) {
            try {
                if (playbook.getActionType() == EstateActionType.NEVER_RELEASE
                        || isNeverRelease(ownerId, playbook.getItemType(), playbook.getItemId())
                        || executionRepository.existsByPlaybook_IdAndSourceTypeAndSourceReferenceId(
                        playbook.getId(),
                        sourceType,
                        sourceReferenceId
                )) {
                    continue;
                }

                InternalVaultItemResponse item = vaultClient.getOrNull(
                        ownerId,
                        playbook.getItemType(),
                        playbook.getItemId()
                );
                if (item == null) continue;

                createExecution(playbook, item, sourceType, sourceReferenceId);
                releasedCount++;
            } catch (ResponseStatusException exception) {
                log.warn(
                        "Skipped estate playbook id={} during {} release: {}",
                        playbook.getId(),
                        sourceType,
                        exception.getReason()
                );
            } catch (RuntimeException exception) {
                log.warn(
                        "Skipped estate playbook id={} during {} release: {}",
                        playbook.getId(),
                        sourceType,
                        exception.getMessage()
                );
            }
        }
        return releasedCount;
    }

    private EstatePlaybookExecution createExecution(
            EstatePlaybook playbook,
            InternalVaultItemResponse item,
            EstateExecutionSource sourceType,
            Long sourceReferenceId
    ) {
        EmergencyContact contact = requireEligibleContact(
                playbook.getOwnerId(),
                playbook.getRecipientContact() == null
                        ? null
                        : playbook.getRecipientContact().getId(),
                playbook.getItemType()
        );

        if (isNeverRelease(
                playbook.getOwnerId(),
                playbook.getItemType(),
                playbook.getItemId()
        )) {
            throw new ResponseStatusException(
                    HttpStatus.CONFLICT,
                    "This item is protected by an active Never release rule."
            );
        }

        EstatePlaybookExecution execution = EstatePlaybookExecution.builder()
                .playbook(playbook)
                .ownerId(playbook.getOwnerId())
                .recipientContact(contact)
                .recipientUserId(contact.getContactUserId())
                .recipientEmailSnapshot(contact.getContactEmail())
                .recipientNameSnapshot(clean(
                        contact.getContactName(),
                        contact.getContactEmail()
                ))
                .itemTypeSnapshot(playbook.getItemType())
                .itemIdSnapshot(playbook.getItemId())
                .itemTitleSnapshot(itemTitle(item))
                .actionTypeSnapshot(playbook.getActionType())
                .encryptedInstructionsSnapshot(playbook.getEncryptedInstructions())
                .sourceType(sourceType)
                .sourceReferenceId(sourceReferenceId)
                .status(EstateExecutionStatus.RELEASED)
                .releasedAt(Instant.now())
                .build();

        EstatePlaybookExecution saved = executionRepository.save(execution);
        notificationClient.notifyEstatePlaybookReleased(
                saved.getRecipientUserId(),
                saved.getItemTitleSnapshot(),
                actionLabel(saved.getActionTypeSnapshot())
        );
        notificationClient.notifyEstatePlaybookReleasedOwner(
                saved.getOwnerId(),
                saved.getRecipientEmailSnapshot(),
                saved.getItemTitleSnapshot()
        );
        return saved;
    }

    private Definition validateDefinition(
            Long ownerId,
            EstatePlaybookRequest request,
            Long currentId
    ) {
        String itemType = normalizeItemType(request.itemType());
        EstateActionType actionType = parseAction(request.actionType());
        EstateTriggerType triggerType = parseTrigger(request.triggerType());
        InternalVaultItemResponse item = vaultClient.get(
                ownerId,
                itemType,
                request.itemId()
        );
        String instructions = clean(request.instructions(), "");

        EmergencyContact contact = null;
        if (actionType == EstateActionType.NEVER_RELEASE) {
            triggerType = EstateTriggerType.OWNER_RELEASE;
            instructions = "";
            List<EstatePlaybook> conflicts = playbookRepository
                    .findByOwnerIdAndItemTypeAndItemIdAndStatusIn(
                            ownerId,
                            itemType,
                            item.id(),
                            LIVE_STATUSES
                    );
            boolean conflictingRelease = conflicts.stream()
                    .anyMatch(itemPlaybook -> !Objects.equals(itemPlaybook.getId(), currentId)
                            && itemPlaybook.getActionType() != EstateActionType.NEVER_RELEASE);
            if (conflictingRelease) {
                throw new ResponseStatusException(
                        HttpStatus.CONFLICT,
                        "Archive the other active playbooks for this item before adding a Never release rule."
                );
            }
        } else {
            contact = requireEligibleContact(
                    ownerId,
                    request.recipientContactId(),
                    itemType
            );
            if (isNeverRelease(ownerId, itemType, item.id())) {
                throw new ResponseStatusException(
                        HttpStatus.CONFLICT,
                        "This item has an active Never release rule. Pause or archive that rule first."
                );
            }
            if (actionType != EstateActionType.RELEASE && instructions.length() < 10) {
                throw badRequest(
                        "Add clear instructions of at least 10 characters for this action."
                );
            }
        }

        EstatePlaybook candidate = EstatePlaybook.builder()
                .ownerId(ownerId)
                .recipientContact(contact)
                .itemType(itemType)
                .itemId(item.id())
                .actionType(actionType)
                .triggerType(triggerType)
                .status(EstatePlaybookStatus.ACTIVE)
                .build();
        ensureNoDuplicate(candidate, currentId);

        return new Definition(
                itemType,
                item,
                actionType,
                triggerType,
                contact,
                instructions
        );
    }

    private void validateStoredDefinition(EstatePlaybook playbook, boolean requireActive) {
        if (requireActive && playbook.getStatus() != EstatePlaybookStatus.ACTIVE) {
            throw badRequest("Resume this playbook before releasing it.");
        }

        InternalVaultItemResponse item = vaultClient.getOrNull(
                playbook.getOwnerId(),
                playbook.getItemType(),
                playbook.getItemId()
        );
        if (item == null) {
            throw new ResponseStatusException(
                    HttpStatus.NOT_FOUND,
                    "The linked vault item no longer exists."
            );
        }

        if (playbook.getActionType() == EstateActionType.NEVER_RELEASE) {
            boolean conflictingRelease = playbookRepository
                    .findByOwnerIdAndItemTypeAndItemIdAndStatusIn(
                            playbook.getOwnerId(),
                            playbook.getItemType(),
                            playbook.getItemId(),
                            LIVE_STATUSES
                    )
                    .stream()
                    .anyMatch(other -> !Objects.equals(other.getId(), playbook.getId())
                            && other.getActionType() != EstateActionType.NEVER_RELEASE);
            if (conflictingRelease) {
                throw new ResponseStatusException(
                        HttpStatus.CONFLICT,
                        "Archive the other active or paused playbooks for this item before resuming Never release."
                );
            }
            return;
        }

        if (isNeverRelease(
                playbook.getOwnerId(),
                playbook.getItemType(),
                playbook.getItemId()
        )) {
            throw new ResponseStatusException(
                    HttpStatus.CONFLICT,
                    "This item has an active Never release rule. Pause or archive that rule first."
            );
        }

        requireEligibleContact(
                playbook.getOwnerId(),
                playbook.getRecipientContact() == null
                        ? null
                        : playbook.getRecipientContact().getId(),
                playbook.getItemType()
        );
    }

    private void ensureNoDuplicate(EstatePlaybook candidate, Long currentId) {
        List<EstatePlaybook> existing = playbookRepository
                .findByOwnerIdAndItemTypeAndItemIdAndStatusIn(
                        candidate.getOwnerId(),
                        candidate.getItemType(),
                        candidate.getItemId(),
                        LIVE_STATUSES
                );

        boolean duplicate = existing.stream().anyMatch(playbook ->
                !Objects.equals(playbook.getId(), currentId)
                        && playbook.getActionType() == candidate.getActionType()
                        && playbook.getTriggerType() == candidate.getTriggerType()
                        && Objects.equals(
                        contactId(playbook),
                        contactId(candidate)
                )
        );

        if (duplicate) throw duplicateDefinition(null);
    }

    private EstatePlaybookExecution requireRecipientExecution(
            AuthenticatedUser recipient,
            Long executionId
    ) {
        EstatePlaybookExecution execution = executionRepository
                .findByIdAndRecipientUserId(executionId, recipient.id())
                .orElseThrow(() -> notFound("Released playbook"));

        if (execution.getStatus() == EstateExecutionStatus.CANCELLED) {
            throw forbidden("This estate playbook was cancelled by the owner.");
        }

        EmergencyContact contact = execution.getRecipientContact();
        if (contact == null
                || !contact.isActive()
                || contact.getContactUserId() == null
                || !Objects.equals(contact.getContactUserId(), recipient.id())) {
            throw forbidden(
                    "You are no longer an eligible recipient for this estate playbook."
            );
        }

        if (isNeverRelease(
                execution.getOwnerId(),
                execution.getItemTypeSnapshot(),
                execution.getItemIdSnapshot()
        )) {
            throw forbidden(
                    "The owner added a Never release rule before this item was opened."
            );
        }

        return execution;
    }

    private InternalVaultItemResponse requireReleasedItem(
            EstatePlaybookExecution execution
    ) {
        InternalVaultItemResponse item = vaultClient.getOrNull(
                execution.getOwnerId(),
                execution.getItemTypeSnapshot(),
                execution.getItemIdSnapshot()
        );
        if (item == null) {
            throw new ResponseStatusException(
                    HttpStatus.GONE,
                    "The linked vault item is no longer available. The released instructions remain in the activity record."
            );
        }
        return item;
    }

    private void markViewed(EstatePlaybookExecution execution) {
        if (execution.getStatus() != EstateExecutionStatus.RELEASED) return;

        execution.setStatus(EstateExecutionStatus.VIEWED);
        execution.setViewedAt(Instant.now());
        executionRepository.save(execution);
        notificationClient.notifyEstatePlaybookViewed(
                execution.getOwnerId(),
                execution.getRecipientEmailSnapshot(),
                execution.getItemTitleSnapshot()
        );
    }

    private EmergencyContact requireEligibleContact(
            Long ownerId,
            Long contactId,
            String itemType
    ) {
        if (contactId == null) {
            throw badRequest("Choose a recipient for this estate playbook.");
        }

        EmergencyContact contact = contactRepository
                .findByIdAndOwnerId(contactId, ownerId)
                .orElseThrow(() -> notFound("Emergency contact"));

        if (!contact.isActive()) {
            throw badRequest("Choose an active emergency contact.");
        }
        if (contact.getContactUserId() == null) {
            throw badRequest(
                    "The recipient must have a Guardian account before a playbook can be released to them."
            );
        }
        return contact;
    }

    private List<EstateContactOption> contactOptions(Long ownerId) {
        return contactRepository.findByOwnerIdOrderByCreatedAtDesc(ownerId)
                .stream()
                .map(contact -> new EstateContactOption(
                        contact.getId(),
                        contact.getContactUserId(),
                        clean(contact.getContactName(), contact.getContactEmail()),
                        contact.getContactEmail(),
                        clean(contact.getRelationship(), "Trusted contact"),
                        contact.getContactUserId() != null,
                        contact.isActive(),
                        contact.isAllowPasswords(),
                        contact.isAllowCards(),
                        contact.isAllowDocuments(),
                        contact.isAllowNotes()
                ))
                .toList();
    }

    private VaultItemsResult tryListVaultItems(Long ownerId) {
        try {
            return new VaultItemsResult(listVaultItems(ownerId), true);
        } catch (ResponseStatusException exception) {
            if (exception.getStatusCode().value() == 503) {
                log.warn(
                        "Vault service unavailable while loading estate overview for ownerId={}",
                        ownerId
                );
                return new VaultItemsResult(List.of(), false);
            }
            throw exception;
        }
    }

    private List<EstateVaultItemOption> listVaultItems(Long ownerId) {
        List<EstateVaultItemOption> items = new ArrayList<>();
        for (String type : List.of("PASSWORD", "CARD", "DOCUMENT", "NOTE")) {
            for (InternalVaultItemResponse item : vaultClient.list(ownerId, type)) {
                items.add(new EstateVaultItemOption(
                        item.id(),
                        type,
                        itemTitle(item),
                        item.updatedAt()
                ));
            }
        }
        items.sort(Comparator.comparing(
                EstateVaultItemOption::updatedAt,
                Comparator.nullsLast(Comparator.reverseOrder())
        ));
        return items;
    }

    private EstatePlaybookResponse toPlaybookResponse(
            EstatePlaybook playbook,
            boolean itemAvailable
    ) {
        EmergencyContact contact = playbook.getRecipientContact();
        return new EstatePlaybookResponse(
                playbook.getId(),
                playbook.getItemType(),
                playbook.getItemId(),
                playbook.getItemTitleSnapshot(),
                playbook.getActionType().name(),
                playbook.getTriggerType().name(),
                contact == null ? null : contact.getId(),
                contact == null ? null : contact.getContactUserId(),
                contact == null ? null : clean(
                        contact.getContactName(),
                        contact.getContactEmail()
                ),
                contact == null ? null : contact.getContactEmail(),
                cryptoService.decrypt(playbook.getEncryptedInstructions()),
                playbook.getStatus().name(),
                itemAvailable,
                playbook.getCreatedAt(),
                playbook.getUpdatedAt()
        );
    }

    private EstateExecutionResponse toExecutionResponse(
            EstatePlaybookExecution execution,
            InternalUserResponse owner,
            boolean ownerView,
            boolean includeInstructions,
            boolean itemAvailable
    ) {
        EstateExecutionStatus status = execution.getStatus();
        return new EstateExecutionResponse(
                execution.getId(),
                execution.getPlaybook().getId(),
                owner == null
                        ? "Vault owner"
                        : clean(owner.fullName(), owner.email()),
                owner == null ? "" : clean(owner.email(), ""),
                execution.getRecipientNameSnapshot(),
                execution.getRecipientEmailSnapshot(),
                execution.getItemTypeSnapshot(),
                execution.getItemIdSnapshot(),
                execution.getItemTitleSnapshot(),
                execution.getActionTypeSnapshot().name(),
                execution.getSourceType().name(),
                status.name(),
                includeInstructions
                        ? cryptoService.decrypt(execution.getEncryptedInstructionsSnapshot())
                        : "",
                itemAvailable,
                !ownerView
                        && itemAvailable
                        && (status == EstateExecutionStatus.RELEASED
                        || status == EstateExecutionStatus.VIEWED
                        || status == EstateExecutionStatus.COMPLETED),
                ownerView
                        && status == EstateExecutionStatus.RELEASED
                        && execution.getViewedAt() == null,
                !ownerView && status == EstateExecutionStatus.VIEWED,
                execution.getReleasedAt(),
                execution.getViewedAt(),
                execution.getCompletedAt(),
                execution.getCancelledAt()
        );
    }

    private EstateReleasedItemResponse toReleasedItem(
            EstatePlaybookExecution execution,
            InternalVaultItemResponse item,
            InternalUserResponse owner
    ) {
        return new EstateReleasedItemResponse(
                execution.getId(),
                clean(owner.fullName(), owner.email()),
                clean(owner.email(), ""),
                execution.getActionTypeSnapshot().name(),
                cryptoService.decrypt(execution.getEncryptedInstructionsSnapshot()),
                item.itemType(),
                item.id(),
                itemTitle(item),
                clean(item.usernameValue(), ""),
                clean(item.password(), ""),
                clean(item.website(), ""),
                clean(item.notes(), ""),
                clean(item.cardName(), ""),
                clean(item.cardNumber(), ""),
                clean(item.expiryDate(), ""),
                clean(item.cvv(), ""),
                clean(item.cardholderName(), ""),
                clean(item.documentName(), ""),
                clean(item.documentType(), ""),
                item.sizeBytes(),
                clean(item.documentNotes(), ""),
                clean(item.category(), ""),
                clean(item.content(), ""),
                item.pinned(),
                execution.getReleasedAt(),
                execution.getViewedAt(),
                item.createdAt(),
                item.updatedAt()
        );
    }

    private boolean recipientStillEligible(
            EstatePlaybookExecution execution,
            Long recipientUserId
    ) {
        EmergencyContact contact = execution.getRecipientContact();
        return contact != null
                && contact.isActive()
                && contact.getContactUserId() != null
                && Objects.equals(contact.getContactUserId(), recipientUserId);
    }

    private boolean available(
            EstatePlaybookExecution execution,
            Map<String, Boolean> availability
    ) {
        if (execution.getStatus() == EstateExecutionStatus.CANCELLED
                || isNeverRelease(execution.getOwnerId(), execution.getItemTypeSnapshot(), execution.getItemIdSnapshot())) {
            return false;
        }
        String key = itemKey(
                execution.getOwnerId(),
                execution.getItemTypeSnapshot(),
                execution.getItemIdSnapshot()
        );
        return availability.computeIfAbsent(key, ignored -> {
            try {
                return vaultClient.getOrNull(
                        execution.getOwnerId(),
                        execution.getItemTypeSnapshot(),
                        execution.getItemIdSnapshot()
                ) != null;
            } catch (ResponseStatusException exception) {
                return exception.getStatusCode().value() == 503;
            }
        });
    }

    private void requireEligiblePlan(Long ownerId) {
        SubscriptionEntitlements entitlements = subscriptionClient.getEntitlements(ownerId);
        if (!isEligible(entitlements)) {
            throw forbidden(
                    "Digital Estate Playbooks are available on Premium and Family plans."
            );
        }
    }

    private SubscriptionEntitlements tryGetEntitlements(Long ownerId) {
        try {
            return subscriptionClient.getEntitlements(ownerId);
        } catch (ResponseStatusException exception) {
            if (exception.getStatusCode().value() == 503) return null;
            throw exception;
        }
    }

    private boolean isEligible(SubscriptionEntitlements entitlements) {
        if (entitlements == null || !entitlements.active()) return false;
        return ("PREMIUM".equalsIgnoreCase(entitlements.plan())
                || "FAMILY".equalsIgnoreCase(entitlements.plan()))
                && entitlements.canUseEmergencyVaultItemSharing();
    }

    private String plan(SubscriptionEntitlements entitlements) {
        if (entitlements == null) return "UNKNOWN";
        if (!entitlements.active()) return "FREE";
        String plan = clean(entitlements.plan(), "FREE").toUpperCase(Locale.ROOT);
        return Set.of("PREMIUM", "FAMILY").contains(plan) ? plan : "FREE";
    }

    private EstatePlaybook requireOwnedPlaybook(Long ownerId, Long id) {
        return playbookRepository.findByIdAndOwnerId(id, ownerId)
                .orElseThrow(() -> notFound("Estate playbook"));
    }

    private void requireNotArchived(EstatePlaybook playbook) {
        if (playbook.getStatus() == EstatePlaybookStatus.ARCHIVED) {
            throw badRequest("This estate playbook has already been archived.");
        }
    }

    private String normalizeItemType(String value) {
        String normalized = clean(value, "").toUpperCase(Locale.ROOT);
        if (!ITEM_TYPES.contains(normalized)) {
            throw badRequest("Unknown vault item type.");
        }
        return normalized;
    }

    private EstateActionType parseAction(String value) {
        try {
            return EstateActionType.valueOf(clean(value, "").toUpperCase(Locale.ROOT));
        } catch (IllegalArgumentException exception) {
            throw badRequest("Unknown estate action type.");
        }
    }

    private EstateTriggerType parseTrigger(String value) {
        try {
            return EstateTriggerType.valueOf(clean(value, "").toUpperCase(Locale.ROOT));
        } catch (IllegalArgumentException exception) {
            throw badRequest("Unknown estate trigger type.");
        }
    }

    private Long contactId(EstatePlaybook playbook) {
        return playbook.getRecipientContact() == null
                ? null
                : playbook.getRecipientContact().getId();
    }

    private String itemTitle(InternalVaultItemResponse item) {
        if (item == null) return "Vault item";
        String type = normalizeItemType(item.itemType());
        return switch (type) {
            case "CARD" -> clean(item.cardName(), clean(item.title(), "Saved card"));
            case "DOCUMENT" -> clean(item.documentName(), clean(item.title(), "Document"));
            default -> clean(item.title(), type.equals("NOTE") ? "Secure note" : "Password");
        };
    }

    private String actionLabel(EstateActionType actionType) {
        return switch (actionType) {
            case RELEASE -> "release";
            case TRANSFER -> "transfer guidance";
            case CANCEL -> "cancellation guidance";
            case DELETE -> "deletion guidance";
            case ARCHIVE -> "archiving guidance";
            case NEVER_RELEASE -> "protection rule";
        };
    }

    private Map<Long, InternalUserResponse> usersById(Collection<Long> ids) {
        if (ids == null || ids.isEmpty()) return Map.of();
        return authClient.findByIds(ids).stream().collect(Collectors.toMap(
                InternalUserResponse::id,
                user -> user,
                (first, ignored) -> first
        ));
    }

    private String itemKey(Long ownerId, String itemType, Long itemId) {
        return ownerId + ":" + normalizeItemType(itemType) + ":" + itemId;
    }

    private String clean(String value, String fallback) {
        return value == null || value.isBlank() ? fallback : value.trim();
    }

    private ResponseStatusException duplicateDefinition(Exception cause) {
        return new ResponseStatusException(
                HttpStatus.CONFLICT,
                "An active or paused playbook with the same item, recipient, action and trigger already exists.",
                cause
        );
    }

    private ResponseStatusException badRequest(String message) {
        return new ResponseStatusException(HttpStatus.BAD_REQUEST, message);
    }

    private ResponseStatusException forbidden(String message) {
        return new ResponseStatusException(HttpStatus.FORBIDDEN, message);
    }

    private ResponseStatusException notFound(String resource) {
        return new ResponseStatusException(HttpStatus.NOT_FOUND, resource + " not found.");
    }

    private record VaultItemsResult(
            List<EstateVaultItemOption> items,
            boolean available
    ) {}

    private record Definition(
            String itemType,
            InternalVaultItemResponse item,
            EstateActionType actionType,
            EstateTriggerType triggerType,
            EmergencyContact contact,
            String instructions
    ) {}
}
