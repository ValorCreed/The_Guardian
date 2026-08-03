package com.vault.theguardian.notificationservice.notification;

import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;
import com.vault.theguardian.notificationservice.push.DatabaseClock;
import com.vault.theguardian.notificationservice.push.PushDispatchService;
import com.vault.theguardian.notificationservice.push.PushPreferenceService;
import com.vault.theguardian.notificationservice.push.PushTokenService;

import java.util.List;

@Service
public class NotificationService {
    private final NotificationRepository notificationRepository;
    private final PushDispatchService pushDispatchService;
    private final PushTokenService pushTokenService;
    private final PushPreferenceService pushPreferenceService;
    private final DatabaseClock databaseClock;

    public NotificationService(
            NotificationRepository notificationRepository,
            PushDispatchService pushDispatchService,
            PushTokenService pushTokenService,
            PushPreferenceService pushPreferenceService,
            DatabaseClock databaseClock
    ) {
        this.notificationRepository = notificationRepository;
        this.pushDispatchService = pushDispatchService;
        this.pushTokenService = pushTokenService;
        this.pushPreferenceService = pushPreferenceService;
        this.databaseClock = databaseClock;
    }

    @Transactional(readOnly = true)
    public List<NotificationResponse> getMyNotifications(Long userId) {
        return notificationRepository.findByUserIdOrderByCreatedAtDesc(userId)
                .stream()
                .map(this::toResponse)
                .toList();
    }

    @Transactional(readOnly = true)
    public UnreadCountResponse getUnreadCount(Long userId) {
        return new UnreadCountResponse(
                notificationRepository.countByUserIdAndReadFalse(userId)
        );
    }

    @Transactional
    public NotificationResponse markAsRead(Long userId, Long id) {
        AppNotification notification = findOwnedNotification(userId, id);
        notification.setRead(true);
        AppNotification saved = notificationRepository.save(notification);
        return toResponse(saved);
    }

    @Transactional
    public void markAllAsRead(Long userId) {
        List<AppNotification> notifications =
                notificationRepository.findByUserIdOrderByCreatedAtDesc(userId);
        notifications.forEach(notification -> notification.setRead(true));
        notificationRepository.saveAll(notifications);
    }

    @Transactional
    public void deleteNotification(Long userId, Long id) {
        notificationRepository.delete(findOwnedNotification(userId, id));
    }

    @Transactional
    public NotificationResponse createNotification(CreateNotificationRequest request) {
        AppNotification notification = AppNotification.builder()
                .userId(request.userId())
                .type(request.type())
                .title(request.title().trim())
                .message(request.message().trim())
                .actionRoute(cleanNullable(request.actionRoute()))
                .read(false)
                .createdAt(databaseClock.now())
                .build();

        AppNotification saved = notificationRepository.save(notification);
        pushDispatchService.queue(saved);
        return toResponse(saved);
    }

    @Transactional
    public void deleteAllForUser(Long userId) {
        notificationRepository.deleteByUserId(userId);
        pushTokenService.deleteForUser(userId);
        pushPreferenceService.deleteForUser(userId);
    }

    private AppNotification findOwnedNotification(Long userId, Long id) {
        return notificationRepository.findByIdAndUserId(id, userId)
                .orElseThrow(() -> new ResponseStatusException(
                        HttpStatus.NOT_FOUND,
                        "Notification not found."
                ));
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

    private String cleanNullable(String value) {
        return value == null || value.isBlank() ? null : value.trim();
    }
}
