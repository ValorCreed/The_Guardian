package com.vault.theguardian.notificationservice.notification;

import com.vault.theguardian.notificationservice.auth.AuthenticatedUser;
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
    public List<NotificationResponse> getMyNotifications(
            @AuthenticationPrincipal AuthenticatedUser user
    ) {
        return notificationService.getMyNotifications(user.userId());
    }

    @GetMapping("/unread-count")
    public UnreadCountResponse getUnreadCount(
            @AuthenticationPrincipal AuthenticatedUser user
    ) {
        return notificationService.getUnreadCount(user.userId());
    }

    @PutMapping("/{id}/read")
    public NotificationResponse markAsRead(
            @AuthenticationPrincipal AuthenticatedUser user,
            @PathVariable Long id
    ) {
        return notificationService.markAsRead(user.userId(), id);
    }

    @PutMapping("/read-all")
    public void markAllAsRead(@AuthenticationPrincipal AuthenticatedUser user) {
        notificationService.markAllAsRead(user.userId());
    }

    @DeleteMapping("/{id}")
    public void deleteNotification(
            @AuthenticationPrincipal AuthenticatedUser user,
            @PathVariable Long id
    ) {
        notificationService.deleteNotification(user.userId(), id);
    }
}
