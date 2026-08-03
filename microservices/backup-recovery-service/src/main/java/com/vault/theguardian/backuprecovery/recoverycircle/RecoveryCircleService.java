package com.vault.theguardian.backuprecovery.recoverycircle;

import com.vault.theguardian.backuprecovery.access.AccessSharingClient;
import com.vault.theguardian.backuprecovery.access.RecoveryContactOption;
import com.vault.theguardian.backuprecovery.auth.AuthClient;
import com.vault.theguardian.backuprecovery.auth.AuthenticatedUser;
import com.vault.theguardian.backuprecovery.auth.InternalUserResponse;
import com.vault.theguardian.backuprecovery.common.MessageResponse;
import com.vault.theguardian.backuprecovery.notification.NotificationClient;
import com.vault.theguardian.backuprecovery.recovery.RecoveryKit;
import com.vault.theguardian.backuprecovery.recovery.RecoveryKitRepository;
import com.vault.theguardian.backuprecovery.subscription.SubscriptionClient;
import com.vault.theguardian.backuprecovery.subscription.SubscriptionEntitlements;
import jakarta.transaction.Transactional;
import org.springframework.http.HttpStatus;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

import java.security.SecureRandom;
import java.time.LocalDateTime;
import java.util.*;
import java.util.function.Function;
import java.util.stream.Collectors;

@Service
@Transactional
public class RecoveryCircleService {
    private static final int MIN_MEMBERS = 2;
    private static final int MAX_MEMBERS = 5;
    private static final int REQUEST_LIFETIME_HOURS = 48;
    private static final Set<RecoveryCircleRequestStatus> OPEN_STATUSES = Set.of(
            RecoveryCircleRequestStatus.PENDING,
            RecoveryCircleRequestStatus.APPROVED
    );

    private final RecoveryCircleRepository circleRepository;
    private final RecoveryCircleMemberRepository memberRepository;
    private final RecoveryCircleRequestRepository requestRepository;
    private final RecoveryCircleVoteRepository voteRepository;
    private final RecoveryKitRepository recoveryKitRepository;
    private final AuthClient authClient;
    private final AccessSharingClient accessSharingClient;
    private final SubscriptionClient subscriptionClient;
    private final NotificationClient notificationClient;
    private final PasswordEncoder passwordEncoder;
    private final SecureRandom secureRandom = new SecureRandom();

    public RecoveryCircleService(
            RecoveryCircleRepository circleRepository,
            RecoveryCircleMemberRepository memberRepository,
            RecoveryCircleRequestRepository requestRepository,
            RecoveryCircleVoteRepository voteRepository,
            RecoveryKitRepository recoveryKitRepository,
            AuthClient authClient,
            AccessSharingClient accessSharingClient,
            SubscriptionClient subscriptionClient,
            NotificationClient notificationClient,
            PasswordEncoder passwordEncoder
    ) {
        this.circleRepository = circleRepository;
        this.memberRepository = memberRepository;
        this.requestRepository = requestRepository;
        this.voteRepository = voteRepository;
        this.recoveryKitRepository = recoveryKitRepository;
        this.authClient = authClient;
        this.accessSharingClient = accessSharingClient;
        this.subscriptionClient = subscriptionClient;
        this.notificationClient = notificationClient;
        this.passwordEncoder = passwordEncoder;
    }

    public RecoveryCircleOverviewResponse getOverview(AuthenticatedUser user) {
        return buildOverview(user, null);
    }

    private RecoveryCircleOverviewResponse buildOverview(
            AuthenticatedUser user,
            String recoveryCode
    ) {
        Long userId = requireUserId(user);
        RecoveryCircle ownedCircle = circleRepository.findByOwnerId(userId).orElse(null);
        SubscriptionEntitlements entitlements = tryGetEntitlements(userId);
        boolean eligible = isEligible(entitlements);

        List<RecoveryCircleCandidateResponse> candidates = List.of();
        if (eligible || ownedCircle != null) {
            try {
                candidates = accessSharingClient.getRecoveryContacts(userId).stream()
                        .map(this::toCandidate)
                        .toList();
            } catch (RuntimeException ignored) {
                // Existing recovery protection remains visible even when a dependency is down.
            }
        }

        List<RecoveryCircleMemberResponse> members = ownedCircle == null
                ? List.of()
                : memberRepository.findByCircleIdOrderByCreatedAtAsc(ownedCircle.getId())
                .stream()
                .map(this::toMember)
                .toList();

        List<RecoveryCircleRequestResponse> ownedRequests = requestRepository
                .findByOwnerIdOrderByCreatedAtDesc(userId)
                .stream()
                .peek(this::refreshExpired)
                .limit(10)
                .map(request -> toRequestResponse(request, userId))
                .toList();

        List<RecoveryCircleRequestResponse> approvalRequests = memberRepository
                .findByMemberUserIdOrderByCreatedAtDesc(userId)
                .stream()
                .map(RecoveryCircleMember::getCircle)
                .map(circle -> requestRepository
                        .findFirstByCircleIdAndStatusInOrderByCreatedAtDesc(
                                circle.getId(), OPEN_STATUSES
                        )
                        .orElse(null))
                .filter(Objects::nonNull)
                .peek(this::refreshExpired)
                .filter(request -> request.getStatus() == RecoveryCircleRequestStatus.PENDING)
                .map(request -> toRequestResponse(request, userId))
                .toList();

        boolean configured = ownedCircle != null;
        boolean enabled = configured && ownedCircle.isActive();
        String message = !configured
                ? "Choose trusted contacts and require multiple approvals for account recovery."
                : enabled
                ? "Your Recovery Circle is active."
                : "Your Recovery Circle is disabled.";

        return new RecoveryCircleOverviewResponse(
                plan(entitlements),
                eligible || configured,
                eligible,
                configured,
                enabled,
                configured ? ownedCircle.getApprovalThreshold() : 2,
                members,
                candidates,
                ownedRequests,
                approvalRequests,
                recoveryCode,
                message
        );
    }

    public RecoveryCircleOverviewResponse updateCircle(
            AuthenticatedUser user,
            UpdateRecoveryCircleRequest request
    ) {
        Long ownerId = requireUserId(user);
        if (!authClient.verifyPassword(ownerId, request.password())) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Incorrect password.");
        }

        RecoveryCircle circle = circleRepository.findByOwnerIdForUpdate(ownerId).orElse(null);
        boolean enabling = Boolean.TRUE.equals(request.enabled());

        if (!enabling) {
            if (circle == null) {
                return buildOverview(user, null);
            }
            cancelOpenRequest(circle, "Recovery Circle was disabled by the account owner.");
            circle.setActive(false);
            circle.setUpdatedAt(LocalDateTime.now());
            circleRepository.save(circle);
            notificationClient.notifyRecoveryCircleDisabled(ownerId);
            return buildOverview(user, null);
        }

        SubscriptionEntitlements entitlements = subscriptionClient.getEntitlements(ownerId);
        requireEligible(entitlements);

        List<Long> selectedIds = Optional.ofNullable(request.memberUserIds())
                .orElseGet(List::of)
                .stream()
                .filter(Objects::nonNull)
                .distinct()
                .toList();

        if (selectedIds.size() < MIN_MEMBERS || selectedIds.size() > MAX_MEMBERS) {
            throw badRequest("Choose between 2 and 5 trusted contacts.");
        }
        if (selectedIds.contains(ownerId)) {
            throw badRequest("You cannot add your own account to its Recovery Circle.");
        }

        int threshold = request.threshold() == null ? 2 : request.threshold();
        if (threshold < 2 || threshold > selectedIds.size()) {
            throw badRequest("Approval threshold must be between 2 and the number of selected contacts.");
        }

        Map<Long, RecoveryContactOption> eligibleContacts = accessSharingClient
                .getRecoveryContacts(ownerId)
                .stream()
                .collect(Collectors.toMap(
                        RecoveryContactOption::userId,
                        Function.identity(),
                        (left, right) -> left
                ));

        List<RecoveryContactOption> selectedContacts = selectedIds.stream()
                .map(eligibleContacts::get)
                .toList();
        if (selectedContacts.stream().anyMatch(Objects::isNull)) {
            throw badRequest(
                    "Every Recovery Circle member must be an active, registered emergency contact."
            );
        }

        if (circle != null) {
            RecoveryCircleRequest activeRequest = findOpenRequest(circle);
            if (activeRequest != null) {
                refreshExpired(activeRequest);
                if (OPEN_STATUSES.contains(activeRequest.getStatus())) {
                    throw new ResponseStatusException(
                            HttpStatus.CONFLICT,
                            "Finish, cancel, or wait for the active recovery request to expire before changing the circle."
                    );
                }
            }
        }

        LocalDateTime now = LocalDateTime.now();
        String recoveryCode = generateRecoveryCode();
        String recoveryCodeHash = passwordEncoder.encode(
                normalizeRecoveryCode(recoveryCode)
        );
        if (circle == null) {
            circle = RecoveryCircle.builder()
                    .ownerId(ownerId)
                    .approvalThreshold(threshold)
                    .recoveryCodeHash(recoveryCodeHash)
                    .active(true)
                    .createdAt(now)
                    .updatedAt(now)
                    .build();
        } else {
            circle.setApprovalThreshold(threshold);
            circle.setRecoveryCodeHash(recoveryCodeHash);
            circle.setActive(true);
            circle.setUpdatedAt(now);
        }
        RecoveryCircle savedCircle = circleRepository.saveAndFlush(circle);

        memberRepository.deleteByCircleId(savedCircle.getId());
        memberRepository.flush();
        List<RecoveryCircleMember> members = selectedContacts.stream()
                .map(contact -> RecoveryCircleMember.builder()
                        .circle(savedCircle)
                        .memberUserId(contact.userId())
                        .memberEmail(clean(contact.email(), ""))
                        .memberName(clean(contact.name(), contact.email()))
                        .createdAt(now)
                        .build())
                .toList();
        memberRepository.saveAll(members);

        notificationClient.notifyRecoveryCircleConfigured(ownerId, threshold, members.size());
        for (RecoveryCircleMember member : members) {
            notificationClient.notifyRecoveryCircleMemberAdded(
                    member.getMemberUserId(),
                    clean(user.email(), "A Guardian user")
            );
        }
        return buildOverview(user, recoveryCode);
    }

    public StartRecoveryCircleResponse startRecovery(StartRecoveryCircleRequest input) {
        String email = normalizeEmail(input.email());
        InternalUserResponse owner = authClient.findByEmail(email);
        if (owner == null || owner.id() == null) {
            throw invalidRecoveryDetails();
        }

        RecoveryCircle circle = circleRepository.findByOwnerIdForUpdate(owner.id())
                .filter(RecoveryCircle::isActive)
                .orElseThrow(this::invalidRecoveryDetails);

        if (!passwordEncoder.matches(
                normalizeRecoveryCode(input.recoveryCode()),
                circle.getRecoveryCodeHash()
        )) {
            throw invalidRecoveryDetails();
        }

        List<RecoveryCircleMember> members = memberRepository
                .findByCircleIdOrderByCreatedAtAsc(circle.getId());
        if (members.size() < MIN_MEMBERS || circle.getApprovalThreshold() > members.size()) {
            throw badRequest("This Recovery Circle is not fully configured.");
        }
        requireCurrentlyEligibleMembers(circle, members);

        RecoveryCircleRequest existing = findOpenRequest(circle);
        if (existing != null) {
            refreshExpired(existing);
            if (OPEN_STATUSES.contains(existing.getStatus())) {
                throw new ResponseStatusException(
                        HttpStatus.CONFLICT,
                        "A Recovery Circle request is already active for this account."
                );
            }
        }

        LocalDateTime now = LocalDateTime.now();
        String publicId = generatePublicId();
        RecoveryCircleRequest saved = requestRepository.save(
                RecoveryCircleRequest.builder()
                        .circle(circle)
                        .ownerId(owner.id())
                        .publicId(publicId)
                        .recoveryCodeHash(circle.getRecoveryCodeHash())
                        .status(RecoveryCircleRequestStatus.PENDING)
                        .approvalCount(0)
                        .denialCount(0)
                        .createdAt(now)
                        .expiresAt(now.plusHours(REQUEST_LIFETIME_HOURS))
                        .build()
        );

        String ownerLabel = clean(owner.fullName(), owner.email());
        for (RecoveryCircleMember member : members) {
            notificationClient.notifyRecoveryCircleApprovalRequested(
                    member.getMemberUserId(), ownerLabel, saved.getPublicId()
            );
        }
        notificationClient.notifyRecoveryCircleRequestStarted(owner.id());

        return new StartRecoveryCircleResponse(
                saved.getPublicId(),
                circle.getApprovalThreshold(),
                saved.getExpiresAt(),
                "Recovery request started. Save the request ID, keep your existing recovery code private, and ask your trusted contacts to approve it."
        );
    }

    public RecoveryCirclePublicStatusResponse getPublicStatus(RecoveryCircleStatusRequest input) {
        RecoveryCircleRequest request = requireRequestWithCode(
                input.requestId(), input.recoveryCode(), true
        );
        refreshExpired(request);
        return toPublicStatus(request);
    }

    public RecoveryCircleRequestResponse approve(
            AuthenticatedUser user,
            String publicId
    ) {
        return vote(user, publicId, RecoveryCircleVoteDecision.APPROVED);
    }

    public RecoveryCircleRequestResponse deny(
            AuthenticatedUser user,
            String publicId
    ) {
        return vote(user, publicId, RecoveryCircleVoteDecision.DENIED);
    }

    public MessageResponse cancelOwnedRequest(AuthenticatedUser user, String publicId) {
        Long ownerId = requireUserId(user);
        RecoveryCircleRequest request = requestRepository.findByPublicIdForUpdate(normalizePublicId(publicId))
                .orElseThrow(() -> new ResponseStatusException(
                        HttpStatus.NOT_FOUND, "Recovery request not found."
                ));
        if (!Objects.equals(request.getOwnerId(), ownerId)) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "This recovery request is not yours.");
        }
        refreshExpired(request);
        if (!OPEN_STATUSES.contains(request.getStatus())) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "This recovery request is no longer active.");
        }
        request.setStatus(RecoveryCircleRequestStatus.CANCELLED);
        request.setCancelledAt(LocalDateTime.now());
        requestRepository.save(request);
        notificationClient.notifyRecoveryCircleRequestCancelled(ownerId);
        return new MessageResponse("Recovery Circle request cancelled.");
    }

    public MessageResponse completeRecovery(CompleteRecoveryCircleRequest input) {
        RecoveryCircleRequest request = requireRequestWithCode(
                input.requestId(), input.recoveryCode(), true
        );
        refreshExpired(request);
        if (request.getStatus() != RecoveryCircleRequestStatus.APPROVED) {
            throw new ResponseStatusException(
                    HttpStatus.CONFLICT,
                    request.getStatus() == RecoveryCircleRequestStatus.PENDING
                            ? "More Recovery Circle approvals are still required."
                            : "This Recovery Circle request cannot be completed."
            );
        }
        requireCurrentApprovalThreshold(request);

        authClient.resetPassword(request.getOwnerId(), input.newPassword(), "RECOVERY_CIRCLE");
        revokeRecoveryKits(request.getOwnerId());

        request.setStatus(RecoveryCircleRequestStatus.COMPLETED);
        request.setCompletedAt(LocalDateTime.now());
        requestRepository.save(request);

        notificationClient.notifyRecoveryCircleCompleted(request.getOwnerId());
        for (RecoveryCircleMember member : memberRepository
                .findByCircleIdOrderByCreatedAtAsc(request.getCircle().getId())) {
            notificationClient.notifyRecoveryCircleCompletedForMember(
                    member.getMemberUserId(), request.getPublicId()
            );
        }
        return new MessageResponse(
                "Password reset successfully. All existing sessions and biometric credentials were revoked."
        );
    }

    private RecoveryCircleRequestResponse vote(
            AuthenticatedUser user,
            String publicId,
            RecoveryCircleVoteDecision decision
    ) {
        Long memberUserId = requireUserId(user);
        RecoveryCircleRequest request = requestRepository
                .findByPublicIdForUpdate(normalizePublicId(publicId))
                .orElseThrow(() -> new ResponseStatusException(
                        HttpStatus.NOT_FOUND, "Recovery request not found."
                ));
        refreshExpired(request);
        if (request.getStatus() != RecoveryCircleRequestStatus.PENDING) {
            throw new ResponseStatusException(
                    HttpStatus.CONFLICT,
                    "This recovery request is no longer accepting votes."
            );
        }

        memberRepository.findByCircleIdAndMemberUserId(
                request.getCircle().getId(), memberUserId
        ).orElseThrow(() -> new ResponseStatusException(
                HttpStatus.FORBIDDEN,
                "You are not a member of this Recovery Circle."
        ));
        Set<Long> eligibleMemberIds = currentEligibleMemberIds(request.getCircle());
        if (!eligibleMemberIds.contains(memberUserId)) {
            throw new ResponseStatusException(
                    HttpStatus.FORBIDDEN,
                    "You are no longer an active recovery contact for this account."
            );
        }

        if (voteRepository.findByRequestIdAndMemberUserId(
                request.getId(), memberUserId
        ).isPresent()) {
            throw new ResponseStatusException(
                    HttpStatus.CONFLICT,
                    "You have already responded to this recovery request."
            );
        }

        voteRepository.saveAndFlush(
                RecoveryCircleVote.builder()
                        .request(request)
                        .memberUserId(memberUserId)
                        .decision(decision)
                        .decidedAt(LocalDateTime.now())
                        .build()
        );

        List<RecoveryCircleVote> currentVotes = voteRepository
                .findByRequestIdOrderByDecidedAtAsc(request.getId());
        int approvals = Math.toIntExact(currentVotes.stream()
                .filter(vote -> eligibleMemberIds.contains(vote.getMemberUserId()))
                .filter(vote -> vote.getDecision() == RecoveryCircleVoteDecision.APPROVED)
                .count());
        int denials = Math.toIntExact(currentVotes.stream()
                .filter(vote -> eligibleMemberIds.contains(vote.getMemberUserId()))
                .filter(vote -> vote.getDecision() == RecoveryCircleVoteDecision.DENIED)
                .count());
        int memberCount = Math.toIntExact(memberRepository
                .findByCircleIdOrderByCreatedAtAsc(request.getCircle().getId())
                .stream()
                .map(RecoveryCircleMember::getMemberUserId)
                .filter(eligibleMemberIds::contains)
                .count());
        int threshold = request.getCircle().getApprovalThreshold();

        request.setApprovalCount(approvals);
        request.setDenialCount(denials);
        if (approvals >= threshold) {
            request.setStatus(RecoveryCircleRequestStatus.APPROVED);
            request.setApprovedAt(LocalDateTime.now());
            notificationClient.notifyRecoveryCircleThresholdReached(request.getOwnerId());
        } else if (memberCount - denials < threshold) {
            request.setStatus(RecoveryCircleRequestStatus.DENIED);
            notificationClient.notifyRecoveryCircleRequestDenied(request.getOwnerId());
        } else {
            notificationClient.notifyRecoveryCircleVoteProgress(
                    request.getOwnerId(), approvals, threshold
            );
        }
        requestRepository.save(request);
        return toRequestResponse(request, memberUserId);
    }

    private RecoveryCircleRequest requireRequestWithCode(
            String publicId,
            String recoveryCode,
            boolean lock
    ) {
        String cleanId = normalizePublicId(publicId);
        RecoveryCircleRequest request = (lock
                ? requestRepository.findByPublicIdForUpdate(cleanId)
                : requestRepository.findByPublicId(cleanId))
                .orElseThrow(() -> new ResponseStatusException(
                        HttpStatus.UNAUTHORIZED, "Invalid recovery details."
                ));
        if (!passwordEncoder.matches(
                normalizeRecoveryCode(recoveryCode), request.getRecoveryCodeHash()
        )) {
            throw new ResponseStatusException(
                    HttpStatus.UNAUTHORIZED, "Invalid recovery details."
            );
        }
        return request;
    }

    private RecoveryCircleRequestResponse toRequestResponse(
            RecoveryCircleRequest request,
            Long currentUserId
    ) {
        RecoveryCircle circle = request.getCircle();
        InternalUserResponse owner = authClient.requireUser(request.getOwnerId());
        int memberCount = Math.toIntExact(memberRepository.countByCircleId(circle.getId()));
        RecoveryCircleVote currentVote = currentUserId == null
                ? null
                : voteRepository.findByRequestIdAndMemberUserId(
                request.getId(), currentUserId
        ).orElse(null);
        boolean member = currentUserId != null && memberRepository
                .findByCircleIdAndMemberUserId(circle.getId(), currentUserId)
                .isPresent();
        boolean currentlyEligible = member
                && isCurrentlyEligibleMember(circle, currentUserId);

        return new RecoveryCircleRequestResponse(
                request.getPublicId(),
                clean(owner.fullName(), owner.email()),
                clean(owner.email(), ""),
                request.getStatus().name(),
                request.getApprovalCount(),
                request.getDenialCount(),
                circle.getApprovalThreshold(),
                memberCount,
                request.getCreatedAt(),
                request.getExpiresAt(),
                request.getApprovedAt(),
                request.getCompletedAt(),
                currentlyEligible && currentVote == null
                        && request.getStatus() == RecoveryCircleRequestStatus.PENDING,
                currentVote == null ? null : currentVote.getDecision().name()
        );
    }

    private RecoveryCirclePublicStatusResponse toPublicStatus(RecoveryCircleRequest request) {
        String message = switch (request.getStatus()) {
            case PENDING -> request.getApprovalCount() + " of "
                    + request.getCircle().getApprovalThreshold() + " approvals received.";
            case APPROVED -> "Your approval threshold has been reached. You can now reset your password.";
            case COMPLETED -> "This Recovery Circle request has already been completed.";
            case DENIED -> "The Recovery Circle could not reach the required approval threshold.";
            case CANCELLED -> "This Recovery Circle request was cancelled.";
            case EXPIRED -> "This Recovery Circle request has expired.";
        };
        return new RecoveryCirclePublicStatusResponse(
                request.getStatus().name(),
                request.getApprovalCount(),
                request.getCircle().getApprovalThreshold(),
                request.getExpiresAt(),
                request.getStatus() == RecoveryCircleRequestStatus.APPROVED,
                message
        );
    }

    private void refreshExpired(RecoveryCircleRequest request) {
        if (OPEN_STATUSES.contains(request.getStatus())
                && LocalDateTime.now().isAfter(request.getExpiresAt())) {
            request.setStatus(RecoveryCircleRequestStatus.EXPIRED);
            requestRepository.save(request);
        }
    }

    private RecoveryCircleRequest findOpenRequest(RecoveryCircle circle) {
        return requestRepository.findFirstByCircleIdAndStatusInOrderByCreatedAtDesc(
                circle.getId(), OPEN_STATUSES
        ).orElse(null);
    }

    private void cancelOpenRequest(RecoveryCircle circle, String reason) {
        RecoveryCircleRequest active = findOpenRequest(circle);
        if (active == null) return;
        refreshExpired(active);
        if (!OPEN_STATUSES.contains(active.getStatus())) return;
        active.setStatus(RecoveryCircleRequestStatus.CANCELLED);
        active.setCancelledAt(LocalDateTime.now());
        requestRepository.save(active);
        notificationClient.notifyRecoveryCircleRequestCancelled(
                circle.getOwnerId(), reason
        );
    }

    private void revokeRecoveryKits(Long ownerId) {
        List<RecoveryKit> kits = recoveryKitRepository.findByUserIdAndActiveTrue(ownerId);
        if (kits.isEmpty()) return;
        LocalDateTime now = LocalDateTime.now();
        for (RecoveryKit kit : kits) {
            kit.setActive(false);
            kit.setRevokedAt(now);
        }
        recoveryKitRepository.saveAll(kits);
    }

    private Set<Long> currentEligibleMemberIds(RecoveryCircle circle) {
        return accessSharingClient
                .getRecoveryContacts(circle.getOwnerId())
                .stream()
                .map(RecoveryContactOption::userId)
                .filter(Objects::nonNull)
                .collect(Collectors.toSet());
    }

    private void requireCurrentlyEligibleMembers(
            RecoveryCircle circle,
            List<RecoveryCircleMember> members
    ) {
        Set<Long> eligibleUserIds = currentEligibleMemberIds(circle);
        boolean allEligible = members.stream()
                .map(RecoveryCircleMember::getMemberUserId)
                .allMatch(eligibleUserIds::contains);
        if (!allEligible) {
            throw new ResponseStatusException(
                    HttpStatus.CONFLICT,
                    "A Recovery Circle member is no longer an active emergency contact. The account owner must update the circle before recovery can start."
            );
        }
    }

    private boolean isCurrentlyEligibleMember(
            RecoveryCircle circle,
            Long memberUserId
    ) {
        try {
            return currentEligibleMemberIds(circle).contains(memberUserId);
        } catch (RuntimeException ignored) {
            // Approval must fail closed when current contact eligibility cannot be verified.
            return false;
        }
    }

    private void requireCurrentApprovalThreshold(RecoveryCircleRequest request) {
        Set<Long> eligibleMemberIds = currentEligibleMemberIds(request.getCircle());
        long validApprovals = voteRepository
                .findByRequestIdOrderByDecidedAtAsc(request.getId())
                .stream()
                .filter(vote -> eligibleMemberIds.contains(vote.getMemberUserId()))
                .filter(vote -> vote.getDecision() == RecoveryCircleVoteDecision.APPROVED)
                .count();

        if (validApprovals < request.getCircle().getApprovalThreshold()) {
            throw new ResponseStatusException(
                    HttpStatus.CONFLICT,
                    "A previous approval is no longer valid because that person is no longer an active recovery contact. Start a new request after the circle is updated."
            );
        }
    }

    private RecoveryCircleMemberResponse toMember(RecoveryCircleMember member) {
        return new RecoveryCircleMemberResponse(
                member.getId(),
                member.getMemberUserId(),
                member.getMemberName(),
                member.getMemberEmail()
        );
    }

    private RecoveryCircleCandidateResponse toCandidate(RecoveryContactOption contact) {
        return new RecoveryCircleCandidateResponse(
                contact.contactId(),
                contact.userId(),
                contact.name(),
                contact.email(),
                contact.relationship()
        );
    }

    private SubscriptionEntitlements tryGetEntitlements(Long ownerId) {
        try {
            return subscriptionClient.getEntitlements(ownerId);
        } catch (RuntimeException ignored) {
            return null;
        }
    }

    private boolean isEligible(SubscriptionEntitlements entitlements) {
        if (entitlements == null || !entitlements.active()) return false;
        String plan = clean(entitlements.plan(), "FREE").toUpperCase();
        return "PREMIUM".equals(plan) || "FAMILY".equals(plan);
    }

    private void requireEligible(SubscriptionEntitlements entitlements) {
        if (!isEligible(entitlements)) {
            throw new ResponseStatusException(
                    HttpStatus.FORBIDDEN,
                    "Recovery Circle is available on Premium and Family plans."
            );
        }
    }

    private String plan(SubscriptionEntitlements entitlements) {
        return entitlements == null
                ? "UNKNOWN"
                : clean(entitlements.plan(), "FREE").toUpperCase();
    }

    private Long requireUserId(AuthenticatedUser user) {
        if (user == null || user.userId() == null) {
            throw new ResponseStatusException(
                    HttpStatus.UNAUTHORIZED,
                    "Authenticated user could not be resolved."
            );
        }
        return user.userId();
    }

    private String generatePublicId() {
        return "RC-" + UUID.randomUUID().toString()
                .replace("-", "")
                .substring(0, 16)
                .toUpperCase();
    }

    private String generateRecoveryCode() {
        String alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
        StringBuilder raw = new StringBuilder();
        for (int i = 0; i < 32; i++) {
            raw.append(alphabet.charAt(secureRandom.nextInt(alphabet.length())));
        }
        String value = raw.toString();
        return String.join("-",
                value.substring(0, 4), value.substring(4, 8),
                value.substring(8, 12), value.substring(12, 16),
                value.substring(16, 20), value.substring(20, 24),
                value.substring(24, 28), value.substring(28, 32)
        );
    }

    private String normalizeRecoveryCode(String value) {
        return value == null ? "" : value.trim().toUpperCase()
                .replace("-", "")
                .replace(" ", "");
    }

    private String normalizePublicId(String value) {
        return value == null ? "" : value.trim().toUpperCase();
    }

    private String normalizeEmail(String value) {
        return value == null ? "" : value.trim().toLowerCase();
    }

    private String clean(String value, String fallback) {
        return value == null || value.isBlank() ? fallback : value.trim();
    }

    private ResponseStatusException invalidRecoveryDetails() {
        return new ResponseStatusException(
                HttpStatus.UNAUTHORIZED,
                "Invalid Recovery Circle details."
        );
    }

    private ResponseStatusException badRequest(String message) {
        return new ResponseStatusException(HttpStatus.BAD_REQUEST, message);
    }
}
