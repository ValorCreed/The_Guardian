package com.vault.theguardian.notificationservice.notification;

import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.time.LocalDateTime;
import java.util.List;

@Service
public class NotificationService {
    private final NotificationRepository notificationRepository;

    public NotificationService(NotificationRepository notificationRepository) {
        this.notificationRepository = notificationRepository;
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
        return toResponse(notificationRepository.save(notification));
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
                .createdAt(LocalDateTime.now())
                .build();

        return toResponse(notificationRepository.save(notification));
    }

    @Transactional
    public void deleteAllForUser(Long userId) {
        notificationRepository.deleteByUserId(userId);
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
