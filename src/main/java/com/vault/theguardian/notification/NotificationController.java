package com.vault.theguardian.notification;

import com.vault.theguardian.user.User;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/vault/notifications")
@CrossOrigin
public class NotificationController {
    private final NotificationService notificationService;

    public NotificationController(NotificationService notificationService) {
        this.notificationService = notificationService;
    }

    @GetMapping
    public List<NotificationResponse> getMyNotifications(@AuthenticationPrincipal User user) {
        return notificationService.getMyNotifications(user);
    }

    @GetMapping("/unread-count")
    public UnreadCountResponse getUnreadCount(@AuthenticationPrincipal User user) {
        return notificationService.getUnreadCount(user);
    }

    @PutMapping("/{id}/read")
    public NotificationResponse markAsRead(
            @AuthenticationPrincipal User user,
            @PathVariable Long id
    ) {
        return notificationService.markAsRead(user, id);
    }

    @PutMapping("/read-all")
    public void markAllAsRead(@AuthenticationPrincipal User user) {
        notificationService.markAllAsRead(user);
    }

    @DeleteMapping("/{id}")
    public void deleteNotification(
            @AuthenticationPrincipal User user,
            @PathVariable Long id
    ) {
        notificationService.deleteNotification(user, id);
    }
}
