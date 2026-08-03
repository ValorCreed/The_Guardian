package com.vault.theguardian.incident;

import com.vault.theguardian.duress.DuressService;
import com.vault.theguardian.integration.NotificationClient;
import com.vault.theguardian.session.DeviceSessionService;
import com.vault.theguardian.session.LockdownSessionResult;
import com.vault.theguardian.session.UserSession;
import com.vault.theguardian.subscription.Subscription;
import com.vault.theguardian.subscription.SubscriptionPlan;
import com.vault.theguardian.subscription.SubscriptionRepository;
import com.vault.theguardian.user.User;
import com.vault.theguardian.user.UserRepository;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpStatus;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.Duration;
import java.time.LocalDateTime;
import java.util.*;

@Service
public class SecurityIncidentService {
    public static final String LOCKDOWN_CODE = "ACCOUNT_LOCKDOWN_ACTIVE";
    private static final Duration CANCELLATION_WINDOW = Duration.ofMinutes(10);
    private static final Set<String> SYSTEM_MANAGED_TASKS = Set.of(
            "VERIFY_SAFE_DEVICE",
            "REVOKE_OTHER_SESSIONS",
            "REVOKE_BIOMETRICS",
            "ROTATE_MASTER_PASSWORD"
    );

    private final SecurityIncidentRepository incidentRepository;
    private final IncidentRecoveryTaskRepository taskRepository;
    private final IncidentTimelineEventRepository timelineRepository;
    private final SubscriptionRepository subscriptionRepository;
    private final PasswordEncoder passwordEncoder;
    private final DeviceSessionService deviceSessionService;
    private final UserRepository userRepository;
    private final DuressService duressService;
    private final NotificationClient notificationClient;
    private final IncidentVaultClient vaultClient;

    public SecurityIncidentService(
            SecurityIncidentRepository incidentRepository,
            IncidentRecoveryTaskRepository taskRepository,
            IncidentTimelineEventRepository timelineRepository,
            SubscriptionRepository subscriptionRepository,
            PasswordEncoder passwordEncoder,
            DeviceSessionService deviceSessionService,
            UserRepository userRepository,
            DuressService duressService,
            NotificationClient notificationClient,
            IncidentVaultClient vaultClient
    ) {
        this.incidentRepository = incidentRepository;
        this.taskRepository = taskRepository;
        this.timelineRepository = timelineRepository;
        this.subscriptionRepository = subscriptionRepository;
        this.passwordEncoder = passwordEncoder;
        this.deviceSessionService = deviceSessionService;
        this.userRepository = userRepository;
        this.duressService = duressService;
        this.notificationClient = notificationClient;
        this.vaultClient = vaultClient;
    }

    @Transactional(readOnly = true)
    public IncidentOverviewResponse overview(User user) {
        Subscription subscription = currentSubscription(user);
        boolean eligible = isPaid(subscription);
        String plan = effectivePlan(subscription);

        SecurityIncident active = incidentRepository
                .findFirstByOwnerAndStatusOrderByStartedAtDesc(user, SecurityIncidentStatus.ACTIVE)
                .orElse(null);
        List<SecurityIncident> history = incidentRepository.findTop5ByOwnerOrderByStartedAtDesc(user);

        String message;
        if (active != null) {
            message = "Incident Lockdown is active. Guardian is restricting the account to this recovery device.";
        } else if (eligible) {
            message = "Contain a suspected compromise, recover critical accounts in order, and verify every required step.";
        } else {
            message = "Incident Lockdown and Recovery Autopilot are available on Premium and Family plans.";
        }

        return new IncidentOverviewResponse(
                plan,
                eligible,
                eligible && active == null,
                message,
                active == null ? null : toResponse(active),
                history.stream().map(this::toResponse).toList()
        );
    }

    @Transactional
    public SecurityIncidentResponse start(
            User user,
            StartIncidentRequest request,
            HttpServletRequest httpRequest
    ) {
        Subscription subscription = requirePaid(user);
        if (!passwordEncoder.matches(request.currentPassword(), user.getPasswordHash())) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Current master password is incorrect.");
        }

        if (incidentRepository.existsByOwnerIdAndStatus(user.getId(), SecurityIncidentStatus.ACTIVE)) {
            throw new ResponseStatusException(
                    HttpStatus.CONFLICT,
                    "An Incident Lockdown is already active for this account."
            );
        }

        UserSession safeSession = deviceSessionService.requireCurrentNormalSession(user, httpRequest);
        LocalDateTime now = LocalDateTime.now();

        SecurityIncident incident;
        try {
            incident = incidentRepository.saveAndFlush(SecurityIncident.builder()
                    .publicId(UUID.randomUUID().toString())
                    .owner(userRepository.getReferenceById(user.getId()))
                    .type(request.type())
                    .status(SecurityIncidentStatus.ACTIVE)
                    .planSnapshot(effectivePlan(subscription))
                    .safeSessionTokenId(safeSession.getTokenId())
                    .safeDeviceIdHash(safeSession.getDeviceIdHash())
                    .safeDeviceName(clean(safeSession.getDeviceName(), "Recovery device"))
                    .userNote(cleanNullable(request.note()))
                    .progress(0)
                    .sessionsRevoked(0)
                    .biometricsRevoked(0)
                    .startedAt(now)
                    .updatedAt(now)
                    .version(0)
                    .build());
        } catch (DataIntegrityViolationException exception) {
            throw new ResponseStatusException(
                    HttpStatus.CONFLICT,
                    "An Incident Lockdown is already active for this account.",
                    exception
            );
        }

        LockdownSessionResult lockdownResult =
                deviceSessionService.lockdownToCurrentSession(user, safeSession.getTokenId());
        incident.setSessionsRevoked(lockdownResult.sessionsRevoked());
        incident.setBiometricsRevoked(lockdownResult.biometricsRevoked());

        duressService.cancelPendingAlerts(user);
        duressService.revokeDuressSessionsForLockdown(user);

        createTasks(incident, request.type(), now);
        addTimeline(incident, "LOCKDOWN_STARTED", "Incident Lockdown started",
                "Guardian designated " + incident.getSafeDeviceName()
                        + " as the recovery device and restricted sensitive account activity.", now);
        addTimeline(incident, "SESSIONS_REVOKED", "Other sessions revoked",
                lockdownResult.sessionsRevoked() + " active session(s) were revoked.", now);
        addTimeline(incident, "BIOMETRICS_REVOKED", "Biometric sign-in revoked",
                lockdownResult.biometricsRevoked() + " biometric credential(s) were revoked.", now);

        recalculateProgress(incident);
        incidentRepository.save(incident);

        notificationClient.notifyIncidentLockdownStarted(
                user,
                request.type().name(),
                lockdownResult.sessionsRevoked()
        );
        return toResponse(incident);
    }

    @Transactional
    public SecurityIncidentResponse updateTask(
            User user,
            Long incidentId,
            Long taskId,
            UpdateIncidentTaskRequest request
    ) {
        SecurityIncident incident = requireActiveOwned(incidentId, user.getId());
        IncidentRecoveryTask task = taskRepository.findForUpdate(incident.getId(), taskId)
                .orElseThrow(() -> new ResponseStatusException(
                        HttpStatus.NOT_FOUND,
                        "Recovery task not found."
                ));

        if (SYSTEM_MANAGED_TASKS.contains(task.getTaskCode())) {
            throw new ResponseStatusException(
                    HttpStatus.CONFLICT,
                    "Guardian verifies this task automatically through its dedicated security action."
            );
        }

        if (task.getStatus() == request.status()) {
            return toResponse(incident);
        }
        if (task.getStatus() == IncidentTaskStatus.COMPLETED) {
            throw new ResponseStatusException(
                    HttpStatus.CONFLICT,
                    "Completed recovery steps cannot be reopened during an active Lockdown."
            );
        }
        if (task.getStatus() == IncidentTaskStatus.NOT_STARTED
                && request.status() == IncidentTaskStatus.COMPLETED) {
            throw new ResponseStatusException(
                    HttpStatus.CONFLICT,
                    "Begin the recovery review before marking this step complete."
            );
        }
        if (task.getStatus() == IncidentTaskStatus.IN_PROGRESS
                && request.status() == IncidentTaskStatus.NOT_STARTED) {
            throw new ResponseStatusException(
                    HttpStatus.CONFLICT,
                    "A recovery review already in progress cannot be reset."
            );
        }

        LocalDateTime now = LocalDateTime.now();
        task.setStatus(request.status());
        task.setCompletedAt(request.status() == IncidentTaskStatus.COMPLETED ? now : null);
        taskRepository.save(task);

        addTimeline(
                incident,
                "TASK_" + request.status().name(),
                task.getTitle(),
                request.status() == IncidentTaskStatus.COMPLETED
                        ? "The recovery step was marked complete on the recovery device."
                        : "The recovery step status changed to "
                        + request.status().name().replace('_', ' ').toLowerCase(Locale.ROOT) + ".",
                now
        );
        recalculateProgress(incident);
        return toResponse(incident);
    }

    @Transactional
    public SecurityIncidentResponse rotateMasterPassword(
            User user,
            Long incidentId,
            RotateIncidentPasswordRequest request
    ) {
        SecurityIncident incident = requireActiveOwned(incidentId, user.getId());

        if (!passwordEncoder.matches(request.currentPassword(), user.getPasswordHash())) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Current master password is incorrect.");
        }
        if (passwordEncoder.matches(request.newPassword(), user.getPasswordHash())) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST,
                    "Choose a new master password that is different from the current password."
            );
        }

        user.setPasswordHash(passwordEncoder.encode(request.newPassword()));
        userRepository.save(user);

        IncidentRecoveryTask task = findTask(incident, "ROTATE_MASTER_PASSWORD");
        task.setStatus(IncidentTaskStatus.COMPLETED);
        task.setCompletedAt(LocalDateTime.now());
        taskRepository.save(task);

        deviceSessionService.lockdownToCurrentSession(user, incident.getSafeSessionTokenId());
        addTimeline(
                incident,
                "MASTER_PASSWORD_ROTATED",
                "Master password rotated",
                "The Guardian master password was changed from the designated recovery device.",
                LocalDateTime.now()
        );
        recalculateProgress(incident);
        notificationClient.notifyIncidentPasswordRotated(user);
        return toResponse(incident);
    }

    @Transactional
    public SecurityIncidentResponse complete(User user, Long incidentId) {
        SecurityIncident incident = requireActiveOwned(incidentId, user.getId());
        List<IncidentRecoveryTask> tasks =
                taskRepository.findByIncidentIdOrderByDisplayOrderAsc(incident.getId());

        List<String> incompleteRequired = tasks.stream()
                .filter(IncidentRecoveryTask::isRequired)
                .filter(task -> task.getStatus() != IncidentTaskStatus.COMPLETED)
                .map(IncidentRecoveryTask::getTitle)
                .toList();
        if (!incompleteRequired.isEmpty()) {
            throw new ResponseStatusException(
                    HttpStatus.CONFLICT,
                    "Complete the required recovery steps first: "
                            + String.join(", ", incompleteRequired) + "."
            );
        }

        LocalDateTime now = LocalDateTime.now();
        incident.setStatus(SecurityIncidentStatus.COMPLETED);
        incident.setCompletedAt(now);
        incident.setProgress(100);
        addTimeline(
                incident,
                "LOCKDOWN_COMPLETED",
                "Incident Lockdown completed",
                "Guardian recorded all required recovery steps and restored normal account access.",
                now
        );
        incidentRepository.save(incident);
        notificationClient.notifyIncidentLockdownCompleted(user);
        return toResponse(incident);
    }

    @Transactional
    public SecurityIncidentResponse cancel(
            User user,
            Long incidentId,
            CancelIncidentRequest request
    ) {
        SecurityIncident incident = requireActiveOwned(incidentId, user.getId());
        if (!passwordEncoder.matches(request.currentPassword(), user.getPasswordHash())) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Current master password is incorrect.");
        }

        LocalDateTime deadline = incident.getStartedAt().plus(CANCELLATION_WINDOW);
        if (LocalDateTime.now().isAfter(deadline)) {
            throw new ResponseStatusException(
                    HttpStatus.CONFLICT,
                    "The short accidental-activation cancellation window has ended. Complete the recovery checklist to close Lockdown safely."
            );
        }

        LocalDateTime now = LocalDateTime.now();
        incident.setStatus(SecurityIncidentStatus.CANCELLED);
        incident.setCancelledAt(now);
        addTimeline(
                incident,
                "LOCKDOWN_CANCELLED",
                "Incident Lockdown cancelled",
                "Lockdown was cancelled during the accidental-activation window. Revoked sessions and biometrics remain revoked.",
                now
        );
        incidentRepository.save(incident);
        notificationClient.notifyIncidentLockdownCancelled(user);
        return toResponse(incident);
    }

    @Transactional
    public void closeAfterVerifiedRecovery(User user, String recoveryMethod) {
        if (user == null || user.getId() == null) return;

        SecurityIncident incident = incidentRepository
                .findActiveForOwnerUpdate(user.getId())
                .orElse(null);
        if (incident == null) return;

        String method = "RECOVERY_CIRCLE".equalsIgnoreCase(recoveryMethod)
                ? "Recovery Circle"
                : "Recovery Kit";
        LocalDateTime now = LocalDateTime.now();

        incident.setStatus(SecurityIncidentStatus.RECOVERED);
        incident.setCompletedAt(now);
        addTimeline(
                incident,
                "LOCKDOWN_RECOVERED_EXTERNALLY",
                "Verified recovery replaced the recovery device",
                method + " reset the master password, revoked all sessions and closed the old device restriction.",
                now
        );
        incidentRepository.save(incident);
        notificationClient.notifyIncidentLockdownRecovered(user, method);
    }

    @Transactional(readOnly = true)
    public boolean isActiveLockdown(Long userId) {
        return userId != null
                && incidentRepository.existsByOwnerIdAndStatus(userId, SecurityIncidentStatus.ACTIVE);
    }

    @Transactional(readOnly = true)
    public LockdownAccessSnapshot accessSnapshot(Long userId, String tokenId, String sessionMode) {
        if (userId == null || "DURESS".equalsIgnoreCase(sessionMode)) {
            return new LockdownAccessSnapshot(false, false);
        }
        SecurityIncident incident = incidentRepository
                .findFirstByOwnerIdAndStatusOrderByStartedAtDesc(
                        userId,
                        SecurityIncidentStatus.ACTIVE
                )
                .orElse(null);
        if (incident == null) return new LockdownAccessSnapshot(false, false);
        return new LockdownAccessSnapshot(
                true,
                tokenId != null && MessageDigest.isEqual(
                        incident.getSafeSessionTokenId().getBytes(StandardCharsets.UTF_8),
                        tokenId.getBytes(StandardCharsets.UTF_8)
                )
        );
    }

    @Transactional(readOnly = true)
    public void requireLoginFromSafeDevice(User user, HttpServletRequest request) {
        SecurityIncident incident = incidentRepository
                .findFirstByOwnerAndStatusOrderByStartedAtDesc(
                        user,
                        SecurityIncidentStatus.ACTIVE
                )
                .orElse(null);
        if (incident == null) return;

        String currentDeviceHash = deviceSessionService.resolveDeviceIdHashForRequest(request);
        if (incident.getSafeDeviceIdHash() == null
                || !MessageDigest.isEqual(
                incident.getSafeDeviceIdHash().getBytes(StandardCharsets.UTF_8),
                currentDeviceHash.getBytes(StandardCharsets.UTF_8)
        )) {
            throw locked("Incident Lockdown is active. Sign in from the designated recovery device.");
        }
    }

    @Transactional
    public void refreshSafeSessionAfterLogin(User user, UserSession session) {
        SecurityIncident incident = incidentRepository
                .findFirstByOwnerAndStatusOrderByStartedAtDesc(
                        user,
                        SecurityIncidentStatus.ACTIVE
                )
                .orElse(null);
        if (incident == null) return;

        if (session == null
                || "DURESS".equalsIgnoreCase(session.getSessionMode())
                || incident.getSafeDeviceIdHash() == null
                || !incident.getSafeDeviceIdHash().equals(session.getDeviceIdHash())) {
            throw locked("Incident Lockdown is active. This device is not authorized for recovery.");
        }

        incident.setSafeSessionTokenId(session.getTokenId());
        incident.setSafeDeviceName(clean(session.getDeviceName(), incident.getSafeDeviceName()));
        incidentRepository.save(incident);
    }

    public ResponseStatusException locked(String message) {
        return new ResponseStatusException(HttpStatus.valueOf(423), LOCKDOWN_CODE + ": " + message);
    }

    private void createTasks(
            SecurityIncident incident,
            SecurityIncidentType type,
            LocalDateTime now
    ) {
        List<TaskSeed> seeds = new ArrayList<>();
        seeds.add(new TaskSeed(
                "VERIFY_SAFE_DEVICE",
                "Recovery device verified",
                "Guardian restricted recovery control to this signed-in device.",
                null,
                true,
                100,
                IncidentTaskStatus.COMPLETED
        ));
        seeds.add(new TaskSeed(
                "REVOKE_OTHER_SESSIONS",
                "Unknown and secondary sessions revoked",
                "Guardian revoked every other active session, including decoy sessions.",
                "/devices",
                true,
                100,
                IncidentTaskStatus.COMPLETED
        ));
        seeds.add(new TaskSeed(
                "REVOKE_BIOMETRICS",
                "Biometric sign-in revoked",
                "Old biometric credentials cannot be used to re-enter the account.",
                "/settings",
                true,
                95,
                IncidentTaskStatus.COMPLETED
        ));
        seeds.add(new TaskSeed(
                "ROTATE_MASTER_PASSWORD",
                "Rotate the Guardian master password",
                "Use a new, unique master password that was not exposed in the incident.",
                null,
                true,
                100,
                IncidentTaskStatus.NOT_STARTED
        ));
        seeds.add(new TaskSeed(
                "SECURE_PRIMARY_EMAIL",
                "Secure the primary email account",
                "Change the email password, revoke unknown sessions, verify 2FA, and review recovery addresses.",
                null,
                type != SecurityIncidentType.LOST_OR_STOLEN_DEVICE,
                95,
                IncidentTaskStatus.NOT_STARTED
        ));
        seeds.add(new TaskSeed(
                "VERIFY_RECOVERY_PATHS",
                "Verify Guardian recovery paths",
                "Confirm the Recovery Kit, Recovery Circle, Safety Check contact, and emergency contacts are still under trusted control.",
                "/recoverykit",
                true,
                85,
                IncidentTaskStatus.NOT_STARTED
        ));
        seeds.add(new TaskSeed(
                "REVIEW_PHONE_ACCOUNT",
                "Review the mobile-network account",
                "For SIM-swap, stolen-device, or email incidents, add a carrier PIN and review recent SIM or number-port activity.",
                null,
                type == SecurityIncidentType.SIM_SWAP
                        || type == SecurityIncidentType.LOST_OR_STOLEN_DEVICE,
                88,
                IncidentTaskStatus.NOT_STARTED
        ));
        seeds.add(new TaskSeed(
                "REVIEW_FINANCIAL_ACCOUNTS",
                "Review banking and payment accounts",
                "Check sign-in history, revoke sessions, rotate exposed credentials, and review recent transactions.",
                null,
                type == SecurityIncidentType.PHISHING_ATTACK
                        || type == SecurityIncidentType.MASTER_PASSWORD_EXPOSED
                        || type == SecurityIncidentType.EMAIL_COMPROMISED,
                90,
                IncidentTaskStatus.NOT_STARTED
        ));

        List<IncidentVaultItem> vaultItems = vaultClient.listPasswords(incident.getOwner().getId());
        List<IncidentVaultItem> prioritized = vaultItems.stream()
                .filter(item -> item.id() != null)
                .sorted(Comparator
                        .comparingInt((IncidentVaultItem item) -> accountPriority(item.website(), item.title()))
                        .reversed()
                        .thenComparing(item -> clean(item.title(), "Saved account")))
                .limit(12)
                .toList();

        for (IncidentVaultItem item : prioritized) {
            int priority = accountPriority(item.website(), item.title());
            boolean required = priority >= 80
                    && type != SecurityIncidentType.LOST_OR_STOLEN_DEVICE;
            String display = clean(item.title(), clean(item.website(), "Saved account"));
            seeds.add(new TaskSeed(
                    "VAULT_ACCOUNT_" + item.id(),
                    "Secure " + display,
                    "Open the provider directly, change the password, revoke other sessions, verify 2FA, and confirm recovery details.",
                    safeExternalUrl(item.website()),
                    required,
                    priority,
                    IncidentTaskStatus.NOT_STARTED
            ));
        }

        int order = 1;
        for (TaskSeed seed : seeds) {
            taskRepository.save(IncidentRecoveryTask.builder()
                    .incident(incident)
                    .taskCode(seed.code())
                    .title(seed.title())
                    .detail(seed.detail())
                    .actionRoute(seed.actionRoute())
                    .required(seed.required())
                    .priority(seed.priority())
                    .displayOrder(order++)
                    .status(seed.status())
                    .completedAt(seed.status() == IncidentTaskStatus.COMPLETED ? now : null)
                    .build());
        }
    }

    private int accountPriority(String website, String title) {
        String value = (clean(website, "") + " " + clean(title, "")).toLowerCase(Locale.ROOT);
        if (containsAny(value, "gmail", "google", "outlook", "microsoft", "yahoo", "proton", "icloud", "email")) {
            return 100;
        }
        if (containsAny(value, "bank", "paypal", "stripe", "paystack", "wise", "revolut", "wallet", "finance")) {
            return 95;
        }
        if (containsAny(value, "mtn", "vodafone", "telecel", "airtel", "carrier", "mobile", "sim")) {
            return 90;
        }
        if (containsAny(value, "aws", "azure", "github", "gitlab", "cloudflare", "digitalocean", "admin")) {
            return 88;
        }
        if (containsAny(value, "facebook", "instagram", "x.com", "twitter", "linkedin", "tiktok")) {
            return 75;
        }
        return 55;
    }

    private String safeExternalUrl(String value) {
        if (value == null || value.isBlank()) return null;
        String trimmed = value.trim();
        String lower = trimmed.toLowerCase(Locale.ROOT);
        if (lower.startsWith("https://")) {
            return trimmed;
        }
        if (trimmed.contains(".") && !trimmed.contains(" ")) {
            return "https://" + trimmed;
        }
        return null;
    }

    private boolean containsAny(String value, String... tokens) {
        for (String token : tokens) {
            if (value.contains(token)) return true;
        }
        return false;
    }

    private SecurityIncident requireActiveOwned(Long incidentId, Long ownerId) {
        SecurityIncident incident = incidentRepository.findOwnedForUpdate(incidentId, ownerId)
                .orElseThrow(() -> new ResponseStatusException(
                        HttpStatus.NOT_FOUND,
                        "Security incident not found."
                ));
        if (incident.getStatus() != SecurityIncidentStatus.ACTIVE) {
            throw new ResponseStatusException(
                    HttpStatus.CONFLICT,
                    "This security incident is already closed."
            );
        }
        return incident;
    }

    private IncidentRecoveryTask findTask(SecurityIncident incident, String code) {
        return taskRepository.findByIncidentIdOrderByDisplayOrderAsc(incident.getId())
                .stream()
                .filter(task -> code.equals(task.getTaskCode()))
                .findFirst()
                .orElseThrow(() -> new IllegalStateException("Required incident task is missing: " + code));
    }

    private void recalculateProgress(SecurityIncident incident) {
        List<IncidentRecoveryTask> tasks =
                taskRepository.findByIncidentIdOrderByDisplayOrderAsc(incident.getId());
        if (tasks.isEmpty()) {
            incident.setProgress(0);
            incidentRepository.save(incident);
            return;
        }

        int totalWeight = tasks.stream().mapToInt(task -> Math.max(1, task.getPriority())).sum();
        int earned = tasks.stream()
                .filter(task -> task.getStatus() == IncidentTaskStatus.COMPLETED)
                .mapToInt(task -> Math.max(1, task.getPriority()))
                .sum();
        incident.setProgress(Math.min(100, (int) Math.round(100.0 * earned / totalWeight)));
        incidentRepository.save(incident);
    }

    private void addTimeline(
            SecurityIncident incident,
            String eventType,
            String title,
            String detail,
            LocalDateTime createdAt
    ) {
        timelineRepository.save(IncidentTimelineEvent.builder()
                .incident(incident)
                .eventType(eventType)
                .title(title)
                .detail(detail)
                .createdAt(createdAt)
                .build());
    }

    private SecurityIncidentResponse toResponse(SecurityIncident incident) {
        List<IncidentRecoveryTask> tasks =
                taskRepository.findByIncidentIdOrderByDisplayOrderAsc(incident.getId());
        List<IncidentTimelineEvent> timeline =
                timelineRepository.findByIncidentIdOrderByCreatedAtDesc(incident.getId());

        boolean canComplete = incident.getStatus() == SecurityIncidentStatus.ACTIVE
                && tasks.stream()
                .filter(IncidentRecoveryTask::isRequired)
                .allMatch(task -> task.getStatus() == IncidentTaskStatus.COMPLETED);
        boolean canCancel = incident.getStatus() == SecurityIncidentStatus.ACTIVE
                && !LocalDateTime.now().isAfter(
                incident.getStartedAt().plus(CANCELLATION_WINDOW)
        );

        return new SecurityIncidentResponse(
                incident.getId(),
                incident.getPublicId(),
                incident.getType().name(),
                incident.getStatus().name(),
                incident.getPlanSnapshot(),
                incident.getSafeDeviceName(),
                incident.getUserNote(),
                incident.getProgress(),
                incident.getSessionsRevoked(),
                incident.getBiometricsRevoked(),
                incident.getStartedAt(),
                incident.getCompletedAt(),
                incident.getCancelledAt(),
                canComplete,
                canCancel,
                tasks.stream().map(task -> new IncidentTaskResponse(
                        task.getId(),
                        task.getTaskCode(),
                        task.getTitle(),
                        task.getDetail(),
                        task.getActionRoute(),
                        task.isRequired(),
                        task.getPriority(),
                        task.getStatus().name(),
                        task.getCompletedAt()
                )).toList(),
                timeline.stream().map(event -> new IncidentTimelineResponse(
                        event.getEventType(),
                        event.getTitle(),
                        event.getDetail(),
                        event.getCreatedAt()
                )).toList()
        );
    }

    private Subscription requirePaid(User user) {
        Subscription subscription = currentSubscription(user);
        if (!isPaid(subscription)) {
            throw new ResponseStatusException(
                    HttpStatus.FORBIDDEN,
                    "Guardian Incident Lockdown is available on Premium and Family plans."
            );
        }
        return subscription;
    }

    private Subscription currentSubscription(User user) {
        return subscriptionRepository.findByUserId(user.getId()).orElse(null);
    }

    private boolean isPaid(Subscription subscription) {
        if (subscription == null
                || !subscription.isActive()
                || subscription.getPlan() == null
                || subscription.getPlan() == SubscriptionPlan.FREE) {
            return false;
        }
        return subscription.getExpiresAt() == null
                || !subscription.getExpiresAt().isBefore(LocalDateTime.now());
    }

    private String effectivePlan(Subscription subscription) {
        return isPaid(subscription) ? subscription.getPlan().name() : "FREE";
    }

    private String clean(String value, String fallback) {
        return value == null || value.isBlank() ? fallback : value.trim();
    }

    private String cleanNullable(String value) {
        return value == null || value.isBlank() ? null : value.trim();
    }

    public record LockdownAccessSnapshot(
            boolean active,
            boolean recoveryAuthorized
    ) {}

    private record TaskSeed(
            String code,
            String title,
            String detail,
            String actionRoute,
            boolean required,
            int priority,
            IncidentTaskStatus status
    ) {}
}
