package com.vault.theguardian.duress;

import com.vault.theguardian.auth.AuthResponse;
import com.vault.theguardian.email.EmailService;
import com.vault.theguardian.integration.NotificationClient;
import com.vault.theguardian.security.JwtService;
import com.vault.theguardian.session.DeviceSessionService;
import com.vault.theguardian.session.UserSession;
import com.vault.theguardian.subscription.Subscription;
import com.vault.theguardian.subscription.SubscriptionPlan;
import com.vault.theguardian.subscription.SubscriptionRepository;
import com.vault.theguardian.user.User;
import com.vault.theguardian.user.UserRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;
import jakarta.servlet.http.HttpServletRequest;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Locale;
import java.util.Set;

@Service
public class DuressService {
    private static final Logger log = LoggerFactory.getLogger(DuressService.class);
    private static final Set<Integer> ALLOWED_DELAYS = Set.of(5, 15, 30, 60);
    /*
     * Always perform a second BCrypt comparison after an invalid master
     * password. This makes accounts without Duress Mode less distinguishable
     * from accounts that have it configured.
     */
    private static final String DUMMY_DURESS_HASH =
            "$2a$12$TCOi1iOMfq2Q9uhbKLpCO.J.z9frt.1wb8sWzqOdb8Lg/Udy9wSs.";

    private final DuressProfileRepository profileRepository;
    private final DuressAlertRepository alertRepository;
    private final SubscriptionRepository subscriptionRepository;
    private final PasswordEncoder passwordEncoder;
    private final EmergencyContactClient emergencyContactClient;
    private final DeviceSessionService deviceSessionService;
    private final JwtService jwtService;
    private final NotificationClient notificationClient;
    private final EmailService emailService;
    private final UserRepository userRepository;

    public DuressService(
            DuressProfileRepository profileRepository,
            DuressAlertRepository alertRepository,
            SubscriptionRepository subscriptionRepository,
            PasswordEncoder passwordEncoder,
            EmergencyContactClient emergencyContactClient,
            DeviceSessionService deviceSessionService,
            JwtService jwtService,
            NotificationClient notificationClient,
            EmailService emailService,
            UserRepository userRepository
    ) {
        this.profileRepository = profileRepository;
        this.alertRepository = alertRepository;
        this.subscriptionRepository = subscriptionRepository;
        this.passwordEncoder = passwordEncoder;
        this.emergencyContactClient = emergencyContactClient;
        this.deviceSessionService = deviceSessionService;
        this.jwtService = jwtService;
        this.notificationClient = notificationClient;
        this.emailService = emailService;
        this.userRepository = userRepository;
    }

    @Transactional(readOnly = true)
    public DuressSettingsResponse settings(User user) {
        Subscription subscription = subscriptionRepository.findByUser(user).orElse(null);
        boolean eligible = isPaid(subscription);
        String plan = effectivePlan(subscription);
        DuressProfile profile = profileRepository.findById(user.getId()).orElse(null);
        List<DuressContactOption> contacts = contactsSafely(user.getId());
        long pending = alertRepository.countByUserAndStatus(user, DuressAlertStatus.PENDING);

        String message;
        if (!eligible) {
            message = "Coercion-Safe Decoy Vault is available on Premium and Family plans.";
        } else if (profile == null || !profile.isEnabled()) {
            message = "Set a separate duress password that opens only a believable decoy vault.";
        } else if (profile.isAlertEnabled()) {
            message = "Duress Mode is active. A delayed trusted-contact alert is configured.";
        } else {
            message = "Duress Mode is active. The decoy vault opens silently without an alert.";
        }

        return new DuressSettingsResponse(
                plan,
                eligible,
                eligible,
                profile != null && profile.isEnabled(),
                profile != null && profile.isAlertEnabled(),
                profile == null ? null : profile.getAlertContactUserId(),
                profile == null ? null : profile.getAlertContactEmail(),
                profile == null ? null : profile.getAlertContactName(),
                profile == null ? 15 : profile.getAlertDelayMinutes(),
                pending,
                profile == null ? null : profile.getUpdatedAt(),
                message,
                contacts
        );
    }

    @Transactional
    public DuressSettingsResponse configure(User user, ConfigureDuressRequest request) {
        requirePaid(user);
        if (!passwordEncoder.matches(request.currentPassword(), user.getPasswordHash())) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Current master password is incorrect.");
        }
        String rawDuressPassword = request.duressPassword();
        if (passwordEncoder.matches(rawDuressPassword, user.getPasswordHash())
                || rawDuressPassword.equals(request.currentPassword())) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST,
                    "The duress password must be different from your master password."
            );
        }

        int delay = request.alertDelayMinutes() == null ? 15 : request.alertDelayMinutes();
        if (!ALLOWED_DELAYS.contains(delay)) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST,
                    "Choose an alert delay of 5, 15, 30, or 60 minutes."
            );
        }

        InternalEmergencyContactResponse selected = null;
        if (request.alertEnabled()) {
            if (request.alertContactUserId() == null) {
                throw new ResponseStatusException(
                        HttpStatus.BAD_REQUEST,
                        "Choose an active Guardian emergency contact for delayed alerts."
                );
            }
            selected = emergencyContactClient.findEligibleContacts(user.getId())
                    .stream()
                    .filter(contact -> request.alertContactUserId().equals(contact.userId()))
                    .findFirst()
                    .orElseThrow(() -> new ResponseStatusException(
                            HttpStatus.BAD_REQUEST,
                            "The selected alert contact is no longer eligible."
                    ));
            if (selected.userId().equals(user.getId())) {
                throw new ResponseStatusException(
                        HttpStatus.BAD_REQUEST,
                        "Choose another trusted person as the alert contact."
                );
            }
        }

        User selectedAccount = null;
        if (selected != null) {
            selectedAccount = userRepository.findById(selected.userId())
                    .filter(User::isEmailVerified)
                    .filter(account -> account.getEmail() != null && !account.getEmail().isBlank())
                    .orElseThrow(() -> new ResponseStatusException(
                            HttpStatus.BAD_REQUEST,
                            "The selected alert contact no longer has an active verified Guardian account."
                    ));
        }

        LocalDateTime now = LocalDateTime.now();
        var existingProfile = profileRepository.findByIdForUpdate(user.getId());
        DuressProfile profile = existingProfile.orElseGet(() -> DuressProfile.builder()
                /*
                 * DuressProfile uses @MapsId, so Hibernate must derive userId
                 * from the associated User when the new entity is persisted.
                 * Do not assign userId here: a non-null id makes Spring Data
                 * treat the new profile as an existing entity and call merge(),
                 * which can trigger Hibernate's "null identifier" assertion.
                 */
                .user(userRepository.getReferenceById(user.getId()))
                .createdAt(now)
                .build());
        profile.setDuressPasswordHash(passwordEncoder.encode(rawDuressPassword));
        profile.setEnabled(true);
        profile.setAlertEnabled(request.alertEnabled());
        profile.setAlertDelayMinutes(delay);
        profile.setAlertContactUserId(selected == null ? null : selected.userId());
        profile.setAlertContactEmail(selectedAccount == null ? null : clean(selectedAccount.getEmail()));
        profile.setAlertContactName(selectedAccount == null
                ? null
                : clean(selectedAccount.getFullName()) == null
                ? clean(selectedAccount.getEmail())
                : clean(selectedAccount.getFullName()));
        profile.setUpdatedAt(now);

        if (existingProfile.isEmpty()) {
            profileRepository.save(profile);
        }
        /* Existing profiles are managed by this transaction and use dirty checking. */

        cancelPendingAlerts(user);
        deviceSessionService.revokeDuressSessions(user);
        return settings(user);
    }

    @Transactional
    public DuressMessageResponse disable(User user, DisableDuressRequest request) {
        if (!passwordEncoder.matches(request.currentPassword(), user.getPasswordHash())) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Current master password is incorrect.");
        }
        DuressProfile profile = profileRepository.findByIdForUpdate(user.getId()).orElse(null);
        if (profile != null) {
            profileRepository.delete(profile);
        }
        cancelPendingAlerts(user);
        deviceSessionService.revokeDuressSessions(user);
        return new DuressMessageResponse("Duress Mode and all active decoy sessions were disabled.");
    }

    @Transactional(readOnly = true)
    public boolean matchesEnabledDuressPassword(User user, String rawPassword) {
        if (user == null || rawPassword == null || rawPassword.isBlank()) return false;

        Subscription subscription = subscriptionRepository.findByUser(user).orElse(null);
        DuressProfile profile = profileRepository.findByUserAndEnabledTrue(user).orElse(null);
        boolean eligible = isPaid(subscription) && profile != null;
        String hashToCheck = eligible ? profile.getDuressPasswordHash() : DUMMY_DURESS_HASH;
        boolean matches = passwordEncoder.matches(rawPassword, hashToCheck);
        return eligible && matches;
    }

    /**
     * Opens the real decoy-vault session without scheduling an alert so the
     * owner can prepare and rehearse it safely. The endpoint itself is
     * accessible only from a verified NORMAL session and requires the normal
     * master password again. Once opened, the mobile app is governed by the
     * exact same DURESS restrictions as a real coercion login.
     */
    @Transactional
    public AuthResponse openPreview(
            User user,
            OpenDuressPreviewRequest request,
            HttpServletRequest httpRequest
    ) {
        Subscription subscription = requirePaid(user);
        if (!passwordEncoder.matches(request.currentPassword(), user.getPasswordHash())) {
            throw new ResponseStatusException(
                    HttpStatus.UNAUTHORIZED,
                    "Current master password is incorrect."
            );
        }
        profileRepository.findByUserAndEnabledTrueForUpdate(user)
                .orElseThrow(() -> new ResponseStatusException(
                        HttpStatus.CONFLICT,
                        "Configure Duress Mode before opening the decoy setup vault."
                ));

        cancelPendingAlerts(user);
        deviceSessionService.revokeDuressSessions(user);
        UserSession session = deviceSessionService.createLoginSession(
                user,
                httpRequest,
                true,
                false,
                "DURESS"
        );
        String token = jwtService.generateToken(user.getEmail(), session.getTokenId());

        return new AuthResponse(
                token,
                user.getId(),
                user.getFullName(),
                user.getEmail(),
                subscription.getPlan().name(),
                user.isEmailVerified(),
                user.isTwoFactorEnabled(),
                false,
                "DURESS"
        );
    }

    @Transactional
    public void scheduleAlertForDuressLogin(User user, String sessionTokenId) {
        if (user == null || sessionTokenId == null || sessionTokenId.isBlank()) return;
        DuressProfile profile = profileRepository
                .findByUserAndEnabledTrueForUpdate(user)
                .orElse(null);
        if (profile == null || !profile.isAlertEnabled()
                || profile.getAlertContactUserId() == null
                || profile.getAlertContactEmail() == null) {
            return;
        }
        /*
         * Keep only the earliest pending signal. Repeated coercion logins must
         * not spam the trusted contact or continually move the alert deadline.
         * A partial unique database index provides the same guarantee during
         * concurrent logins on multiple devices.
         */
        if (alertRepository.existsByUserAndStatus(user, DuressAlertStatus.PENDING)
                || alertRepository.existsByDuressSessionTokenId(sessionTokenId)) {
            return;
        }

        LocalDateTime now = LocalDateTime.now();
        alertRepository.save(DuressAlert.builder()
                .user(user)
                .duressSessionTokenId(sessionTokenId)
                .recipientUserId(profile.getAlertContactUserId())
                .recipientEmail(profile.getAlertContactEmail())
                .recipientName(profile.getAlertContactName())
                .status(DuressAlertStatus.PENDING)
                .triggeredAt(now)
                .sendAt(now.plusMinutes(profile.getAlertDelayMinutes()))
                .version(0)
                .build());
    }


    @Transactional
    public void revokeDuressSessionsForLockdown(User user) {
        deviceSessionService.revokeDuressSessions(user);
    }

    @Transactional
    public void cancelPendingAlerts(User user) {
        List<DuressAlert> alerts = alertRepository.findByUserAndStatus(user, DuressAlertStatus.PENDING);
        if (alerts.isEmpty()) return;
        LocalDateTime now = LocalDateTime.now();
        for (DuressAlert alert : alerts) {
            alert.setStatus(DuressAlertStatus.CANCELLED);
            alert.setCancelledAt(now);
        }
        alertRepository.saveAll(alerts);
    }

    public List<Long> dueAlertIds(LocalDateTime now) {
        return alertRepository.findDueIds(DuressAlertStatus.PENDING, now);
    }

    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void deliverDueAlert(Long alertId, LocalDateTime now) {
        DuressAlert alert = alertRepository.findByIdForUpdate(alertId).orElse(null);
        if (alert == null || alert.getStatus() != DuressAlertStatus.PENDING
                || alert.getSendAt().isAfter(now)) return;

        DuressProfile profile = profileRepository.findById(alert.getUser().getId()).orElse(null);
        if (profile == null || !profile.isEnabled() || !profile.isAlertEnabled()
                || profile.getAlertContactUserId() == null
                || !profile.getAlertContactUserId().equals(alert.getRecipientUserId())) {
            cancelAlert(alert, now);
            return;
        }

        boolean contactStillEligible;
        try {
            contactStillEligible = emergencyContactClient
                    .findEligibleContacts(alert.getUser().getId())
                    .stream()
                    .anyMatch(contact -> alert.getRecipientUserId().equals(contact.userId()));
        } catch (ResponseStatusException unavailable) {
            // Keep it pending so the next scheduler pass can retry safely.
            log.warn("Duress alert {} contact verification deferred: {}", alertId, unavailable.getReason());
            return;
        }
        if (!contactStillEligible) {
            cancelAlert(alert, now);
            return;
        }

        User recipient = userRepository.findById(alert.getRecipientUserId())
                .filter(User::isEmailVerified)
                .filter(account -> account.getEmail() != null && !account.getEmail().isBlank())
                .orElse(null);
        if (recipient == null) {
            cancelAlert(alert, now);
            return;
        }

        /* Refresh snapshots so alerts follow the contact's current account. */
        alert.setRecipientEmail(recipient.getEmail().trim().toLowerCase(Locale.ROOT));
        alert.setRecipientName(clean(recipient.getFullName()));

        notificationClient.notifyDuressAlert(
                recipient.getId(),
                alert.getUser().getFullName(),
                alert.getUser().getEmail()
        );
        emailService.sendDuressAlert(
                alert.getRecipientEmail(),
                alert.getUser().getFullName(),
                alert.getUser().getEmail(),
                alert.getTriggeredAt()
        );
        alert.setStatus(DuressAlertStatus.SENT);
        alert.setSentAt(now);
        alertRepository.save(alert);
    }

    private void cancelAlert(DuressAlert alert, LocalDateTime now) {
        alert.setStatus(DuressAlertStatus.CANCELLED);
        alert.setCancelledAt(now);
        alertRepository.save(alert);
    }

    private List<DuressContactOption> contactsSafely(Long ownerId) {
        try {
            return emergencyContactClient.findEligibleContacts(ownerId).stream()
                    .map(contact -> new DuressContactOption(
                            contact.contactId(), contact.userId(), contact.name(),
                            contact.email(), contact.relationship()
                    ))
                    .toList();
        } catch (ResponseStatusException unavailable) {
            return List.of();
        }
    }

    private Subscription requirePaid(User user) {
        Subscription subscription = subscriptionRepository.findByUser(user).orElse(null);
        if (!isPaid(subscription)) {
            throw new ResponseStatusException(
                    HttpStatus.FORBIDDEN,
                    "Coercion-Safe Decoy Vault is available on Premium and Family plans."
            );
        }
        return subscription;
    }

    private boolean isPaid(Subscription subscription) {
        if (subscription == null || !subscription.isActive() || subscription.getPlan() == null
                || subscription.getPlan() == SubscriptionPlan.FREE) return false;
        return subscription.getExpiresAt() == null
                || !subscription.getExpiresAt().isBefore(LocalDateTime.now());
    }

    private String effectivePlan(Subscription subscription) {
        if (!isPaid(subscription)) return "FREE";
        return subscription.getPlan().name().toUpperCase(Locale.ROOT);
    }

    private String clean(String value) {
        return value == null || value.isBlank() ? null : value.trim();
    }
}