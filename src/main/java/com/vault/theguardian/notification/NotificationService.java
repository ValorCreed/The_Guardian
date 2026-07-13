package com.vault.theguardian.notification;

import com.vault.theguardian.subscription.SubscriptionPlan;
import com.vault.theguardian.user.User;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

import java.time.LocalDateTime;
import java.util.List;

@Service
public class NotificationService {
    private final NotificationRepository notificationRepository;

    public NotificationService(NotificationRepository notificationRepository) {
        this.notificationRepository = notificationRepository;
    }

    public List<NotificationResponse> getMyNotifications(User user) {
        return notificationRepository.findByUserOrderByCreatedAtDesc(user)
                .stream()
                .map(this::toResponse)
                .toList();
    }

    public UnreadCountResponse getUnreadCount(User user) {
        return new UnreadCountResponse(notificationRepository.countByUserAndReadFalse(user));
    }

    public NotificationResponse markAsRead(User user, Long id) {
        AppNotification notification = notificationRepository.findByIdAndUser(id, user)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Notification not found."));

        notification.setRead(true);
        return toResponse(notificationRepository.save(notification));
    }

    public void markAllAsRead(User user) {
        List<AppNotification> notifications = notificationRepository.findByUserOrderByCreatedAtDesc(user);
        notifications.forEach(notification -> notification.setRead(true));
        notificationRepository.saveAll(notifications);
    }

    public void deleteNotification(User user, Long id) {
        AppNotification notification = notificationRepository.findByIdAndUser(id, user)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Notification not found."));

        notificationRepository.delete(notification);
    }

    public void createNotification(
            User user,
            NotificationType type,
            String title,
            String message,
            String actionRoute
    ) {
        if (user == null) return;

        AppNotification notification = AppNotification.builder()
                .user(user)
                .type(type)
                .title(title)
                .message(message)
                .actionRoute(actionRoute)
                .read(false)
                .createdAt(LocalDateTime.now())
                .build();

        notificationRepository.save(notification);
    }

    public void notifyWelcome(User user) {
        String name = user == null || user.getFullName() == null || user.getFullName().isBlank()
                ? "there"
                : user.getFullName().trim();

        createNotification(
                user,
                NotificationType.WELCOME,
                "Welcome to The Guardian",
                "Hi " + name + ", your secure vault is ready. Start by saving your first password, enabling 2FA, and setting up backup protection.",
                "/security"
        );
    }

    public void notifySubscriptionActivated(User user, SubscriptionPlan plan, LocalDateTime expiresAt) {
        String planLabel = formatPlan(plan);
        String expiryText = expiresAt == null ? "for the next month" : "until " + expiresAt.toLocalDate();

        createNotification(
                user,
                NotificationType.SUBSCRIPTION_ACTIVATED,
                planLabel + " activated",
                "Your " + planLabel + " plan is now active " + expiryText + ".",
                "/subscription"
        );
    }

    public void notifySubscriptionCancelled(User user) {
        createNotification(
                user,
                NotificationType.SUBSCRIPTION_CANCELLED,
                "Subscription cancelled",
                "Your paid plan has been cancelled and your account has returned to Free.",
                "/subscription"
        );
    }

    public void notifyBackupCreated(User user, int totalItemCount) {
        createNotification(
                user,
                NotificationType.BACKUP_CREATED,
                "Backup created",
                "Your encrypted vault backup was created successfully with " + totalItemCount + " item(s).",
                "/backup"
        );
    }

    public void notifyBackupRestored(User user, int totalRestoredCount, boolean replaceExisting) {
        String mode = replaceExisting ? "replaced your current vault" : "was merged with your current vault";

        createNotification(
                user,
                NotificationType.BACKUP_RESTORED,
                "Backup restored",
                "Your backup " + mode + ". " + totalRestoredCount + " item(s) were restored.",
                "/backup"
        );
    }

    public void notifyPasswordAdded(User user, String title) {
        createNotification(
                user,
                NotificationType.PASSWORD_ADDED,
                "Password saved",
                cleanTitle(title, "A password") + " was added to your vault.",
                "/vault"
        );
    }

    public void notifyCardAdded(User user, String title) {
        createNotification(
                user,
                NotificationType.CARD_ADDED,
                "Card saved",
                cleanTitle(title, "A card") + " was added to your vault.",
                "/vault"
        );
    }

    public void notifyDocumentAdded(User user, String title) {
        createNotification(
                user,
                NotificationType.DOCUMENT_ADDED,
                "Document saved",
                cleanTitle(title, "A document") + " was added to your document vault.",
                "/vault"
        );
    }

    public void notifySecureNoteAdded(User user, String title) {
        createNotification(
                user,
                NotificationType.NOTE_ADDED,
                "Secure note saved",
                cleanTitle(title, "A secure note") + " was added to your notes vault.",
                "/vault?tab=Notes"
        );
    }

    public void notifySecureNoteUpdated(User user, String title) {
        createNotification(
                user,
                NotificationType.NOTE_UPDATED,
                "Secure note updated",
                cleanTitle(title, "A secure note") + " was updated.",
                "/vault?tab=Notes"
        );
    }

    public void notifySecureNoteDeleted(User user, String title) {
        createNotification(
                user,
                NotificationType.NOTE_DELETED,
                "Secure note deleted",
                cleanTitle(title, "A secure note") + " was removed from your notes vault.",
                "/vault?tab=Notes"
        );
    }

    public void notifyFamilyMemberAdded(User user, String memberEmail) {
        createNotification(
                user,
                NotificationType.FAMILY_MEMBER_ADDED,
                "Family member added",
                cleanTitle(memberEmail, "A family member") + " was added to your family vault.",
                "/family"
        );
    }

    public void notifyFamilyMemberRemoved(User user, String memberEmail) {
        createNotification(
                user,
                NotificationType.FAMILY_MEMBER_REMOVED,
                "Family member removed",
                cleanTitle(memberEmail, "A family member") + " was removed from your family vault.",
                "/family"
        );
    }

    public void notifyEmergencyContactAdded(User user, String contactEmail) {
        createNotification(
                user,
                NotificationType.EMERGENCY_CONTACT_ADDED,
                "Emergency contact added",
                cleanTitle(contactEmail, "A trusted contact") + " was added to your emergency access list.",
                "/emergencyaccess"
        );
    }

    public void notifyEmergencyContactRemoved(User user, String contactEmail) {
        createNotification(
                user,
                NotificationType.EMERGENCY_CONTACT_REMOVED,
                "Emergency contact removed",
                cleanTitle(contactEmail, "A trusted contact") + " was removed from your emergency access list.",
                "/emergencyaccess"
        );
    }

    public void notifyEmergencyAccessRequested(User owner, String requesterEmail) {
        createNotification(
                owner,
                NotificationType.EMERGENCY_ACCESS_REQUESTED,
                "Emergency access requested",
                cleanTitle(requesterEmail, "A trusted contact") + " requested emergency access. Approve or deny the request.",
                "/emergencyaccess"
        );
    }

    public void notifyEmergencyAccessApproved(User requester, String ownerEmail) {
        createNotification(
                requester,
                NotificationType.EMERGENCY_ACCESS_APPROVED,
                "Emergency access approved",
                cleanTitle(ownerEmail, "The vault owner") + " approved your emergency access request.",
                "/emergencyaccess"
        );
    }

    public void notifyEmergencyAccessDenied(User requester, String ownerEmail) {
        createNotification(
                requester,
                NotificationType.EMERGENCY_ACCESS_DENIED,
                "Emergency access denied",
                cleanTitle(ownerEmail, "The vault owner") + " denied your emergency access request.",
                "/emergencyaccess"
        );
    }


    public void notifyNewDeviceLogin(User user, String deviceName, String ipAddress) {
        String deviceLabel = cleanTitle(deviceName, "A device");
        String ipLabel = ipAddress == null || ipAddress.isBlank() || ipAddress.equalsIgnoreCase("Unknown")
                ? ""
                : " from " + ipAddress;

        createNotification(
                user,
                NotificationType.NEW_DEVICE_LOGIN,
                "New device signed in",
                deviceLabel + " signed in to your account" + ipLabel + ". Review trusted devices if this was not you.",
                "/devices"
        );
    }

    public void notifySessionRevoked(User user, String deviceName) {
        createNotification(
                user,
                NotificationType.SESSION_REVOKED,
                "Device session revoked",
                cleanTitle(deviceName, "A device") + " was removed from your trusted devices.",
                "/devices"
        );
    }

    private NotificationResponse toResponse(AppNotification notification) {
        return new NotificationResponse(
                notification.getId(),
                notification.getType(),
                notification.getTitle(),
                notification.getMessage(),
                notification.getActionRoute(),
                notification.isRead(),
                notification.getCreatedAt()
        );
    }

    private String formatPlan(SubscriptionPlan plan) {
        if (plan == null) return "Subscription";
        String value = plan.name().toLowerCase();
        return value.substring(0, 1).toUpperCase() + value.substring(1);
    }

    private String cleanTitle(String value, String fallback) {
        if (value == null || value.isBlank()) return fallback;
        return value.trim();
    }
}
