package com.vault.theguardian.notificationservice.internal;

import com.vault.theguardian.notificationservice.notification.CreateNotificationRequest;
import com.vault.theguardian.notificationservice.notification.NotificationResponse;
import com.vault.theguardian.notificationservice.notification.NotificationService;
import jakarta.validation.Valid;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/internal/notifications")
public class InternalNotificationController {
    private static final String INTERNAL_KEY_HEADER = "X-Internal-Service-Key";

    private final NotificationService notificationService;
    private final InternalServiceKeyValidator internalServiceKeyValidator;

    public InternalNotificationController(
            NotificationService notificationService,
            InternalServiceKeyValidator internalServiceKeyValidator
    ) {
        this.notificationService = notificationService;
        this.internalServiceKeyValidator = internalServiceKeyValidator;
    }

    @DeleteMapping("/users/{userId}")
    public void deleteUserNotifications(
            @RequestHeader(value = INTERNAL_KEY_HEADER, required = false) String suppliedKey,
            @PathVariable Long userId
    ) {
        internalServiceKeyValidator.requireValid(suppliedKey);
        notificationService.deleteAllForUser(userId);
    }

    @PostMapping
    public NotificationResponse createNotification(
            @RequestHeader(value = INTERNAL_KEY_HEADER, required = false) String suppliedKey,
            @Valid @RequestBody CreateNotificationRequest request
    ) {
        internalServiceKeyValidator.requireValid(suppliedKey);
        return notificationService.createNotification(request);
    }
}
