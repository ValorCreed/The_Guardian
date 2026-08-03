package com.vault.theguardian.notificationservice.push;

import com.vault.theguardian.notificationservice.notification.AppNotification;
import com.vault.theguardian.notificationservice.notification.NotificationType;
import org.springframework.stereotype.Component;

import java.util.EnumSet;
import java.util.Set;

@Component
public class PushPolicyResolver {
    private static final Set<NotificationType> SECURITY_CRITICAL = EnumSet.of(
            NotificationType.PASSWORD_BREACHED,
            NotificationType.NEW_DEVICE_LOGIN,
            NotificationType.SESSION_REVOKED,
            NotificationType.TWO_FACTOR_DISABLED,
            NotificationType.RECOVERY_KIT_USED,
            NotificationType.RECOVERY_KIT_REVOKED,
            NotificationType.ACCOUNT_RESET_VAULT_ERASED,
            NotificationType.INCIDENT_LOCKDOWN_STARTED,
            NotificationType.INCIDENT_PASSWORD_ROTATED,
            NotificationType.INCIDENT_LOCKDOWN_COMPLETED,
            NotificationType.INCIDENT_LOCKDOWN_RECOVERED,
            NotificationType.INCIDENT_LOCKDOWN_CANCELLED,
            NotificationType.SECURITY_ALERT,
            NotificationType.DURESS_ALERT
    );

    private static final Set<NotificationType> EMERGENCY_ACTION = EnumSet.of(
            NotificationType.EMERGENCY_ACCESS_REQUESTED,
            NotificationType.EMERGENCY_ACCESS_APPROVED,
            NotificationType.EMERGENCY_ACCESS_DENIED,
            NotificationType.EMERGENCY_ACCESS_AVAILABLE,
            NotificationType.SAFETY_CHECK_GRACE_STARTED,
            NotificationType.SAFETY_CHECK_TRIGGERED,
            NotificationType.RECOVERY_CIRCLE_APPROVAL_REQUESTED,
            NotificationType.RECOVERY_CIRCLE_APPROVED,
            NotificationType.RECOVERY_CIRCLE_DENIED,
            NotificationType.RECOVERY_CIRCLE_CANCELLED,
            NotificationType.RECOVERY_CIRCLE_COMPLETED,
            NotificationType.ESTATE_PLAYBOOK_RELEASED,
            NotificationType.ESTATE_PLAYBOOK_CANCELLED
    );

    private static final Set<NotificationType> CONTINUITY = EnumSet.of(
            NotificationType.CONTINUITY_DRILL_ACK_REQUESTED,
            NotificationType.CONTINUITY_DRILL_COMPLETED,
            NotificationType.CONTINUITY_DRILL_EXPIRED
    );

    private static final Set<NotificationType> BILLING = EnumSet.of(
            NotificationType.SUBSCRIPTION_CANCELLED,
            NotificationType.SUBSCRIPTION_EXPIRED
    );

    public PushPolicy resolve(AppNotification notification) {
        NotificationType type = notification.getType();

        if (type == NotificationType.DURESS_ALERT) {
            return new PushPolicy(
                    true,
                    PushCategory.SECURITY,
                    PushUrgency.CRITICAL,
                    PushPrivacy.GENERIC_SENSITIVE,
                    "The Guardian",
                    "A trusted Guardian contact may need you. Open Guardian privately.",
                    "guardian-security"
            );
        }

        if (type == NotificationType.SAFETY_CHECK_TRIGGERED) {
            return new PushPolicy(
                    true,
                    PushCategory.EMERGENCY_RECOVERY,
                    PushUrgency.CRITICAL,
                    PushPrivacy.GENERIC_SENSITIVE,
                    "The Guardian • Safety Check",
                    "Protected information is ready in Guardian.",
                    "guardian-security"
            );
        }

        if (SECURITY_CRITICAL.contains(type)) {
            return new PushPolicy(
                    true,
                    PushCategory.SECURITY,
                    PushUrgency.CRITICAL,
                    type == NotificationType.NEW_DEVICE_LOGIN
                            || type == NotificationType.SESSION_REVOKED
                            ? PushPrivacy.PUBLIC_SAFE
                            : PushPrivacy.GENERIC_SENSITIVE,
                    "The Guardian • Security",
                    securityBody(type),
                    "guardian-security"
            );
        }

        if (EMERGENCY_ACTION.contains(type)) {
            return new PushPolicy(
                    true,
                    PushCategory.EMERGENCY_RECOVERY,
                    type == NotificationType.SAFETY_CHECK_GRACE_STARTED
                            ? PushUrgency.CRITICAL
                            : PushUrgency.ACTION_REQUIRED,
                    PushPrivacy.GENERIC_SENSITIVE,
                    "The Guardian",
                    emergencyBody(type),
                    type == NotificationType.SAFETY_CHECK_GRACE_STARTED
                            ? "guardian-security"
                            : "guardian-actions"
            );
        }

        if (CONTINUITY.contains(type)) {
            return new PushPolicy(
                    true,
                    PushCategory.CONTINUITY,
                    PushUrgency.REMINDER,
                    PushPrivacy.PUBLIC_SAFE,
                    "The Guardian • Continuity",
                    continuityBody(type),
                    "guardian-reminders"
            );
        }

        if (BILLING.contains(type)) {
            return new PushPolicy(
                    true,
                    PushCategory.BILLING,
                    PushUrgency.ACTION_REQUIRED,
                    PushPrivacy.PUBLIC_SAFE,
                    "The Guardian • Subscription",
                    safe(notification.getMessage(), "Review your Guardian subscription."),
                    "guardian-actions"
            );
        }

        return PushPolicy.inAppOnly();
    }

    private String securityBody(NotificationType type) {
        return switch (type) {
            case NEW_DEVICE_LOGIN -> "A new device signed in. Review it now.";
            case SESSION_REVOKED -> "A Guardian device session was revoked.";
            case TWO_FACTOR_DISABLED ->
                    "Two-factor authentication was disabled. Review this change.";
            case PASSWORD_BREACHED -> "A critical vault risk needs your attention.";
            case RECOVERY_KIT_USED, RECOVERY_KIT_REVOKED, ACCOUNT_RESET_VAULT_ERASED ->
                    "Account recovery activity needs your review.";
            case INCIDENT_LOCKDOWN_STARTED ->
                    "Incident Lockdown is active on your recovery device.";
            case INCIDENT_PASSWORD_ROTATED ->
                    "Your Guardian master password was changed during recovery.";
            case INCIDENT_LOCKDOWN_COMPLETED, INCIDENT_LOCKDOWN_RECOVERED ->
                    "Guardian incident recovery was completed.";
            case INCIDENT_LOCKDOWN_CANCELLED ->
                    "Guardian Incident Lockdown was cancelled.";
            case SECURITY_ALERT ->
                    "Important Guardian security activity needs your attention.";
            default -> "Important Guardian security activity needs your attention.";
        };
    }

    private String emergencyBody(NotificationType type) {
        return switch (type) {
            case EMERGENCY_ACCESS_REQUESTED -> "A trusted-contact request needs your decision.";
            case EMERGENCY_ACCESS_APPROVED, EMERGENCY_ACCESS_AVAILABLE ->
                    "An emergency-access update is ready in Guardian.";
            case EMERGENCY_ACCESS_DENIED -> "An emergency-access request was updated.";
            case SAFETY_CHECK_GRACE_STARTED ->
                    "Your Safety Check needs a check-in now.";
            case RECOVERY_CIRCLE_APPROVAL_REQUESTED ->
                    "A Recovery Circle request needs your decision.";
            case RECOVERY_CIRCLE_APPROVED ->
                    "A Recovery Circle request reached its approval threshold.";
            case RECOVERY_CIRCLE_DENIED ->
                    "A Recovery Circle request was denied.";
            case RECOVERY_CIRCLE_CANCELLED ->
                    "A Recovery Circle request was cancelled.";
            case RECOVERY_CIRCLE_COMPLETED ->
                    "Guardian account recovery was completed.";
            case ESTATE_PLAYBOOK_RELEASED ->
                    "A protected Guardian item is available for you.";
            case ESTATE_PLAYBOOK_CANCELLED ->
                    "A protected Guardian release was cancelled.";
            default -> "Guardian needs your attention.";
        };
    }

    private String continuityBody(NotificationType type) {
        return switch (type) {
            case CONTINUITY_DRILL_ACK_REQUESTED ->
                    "A safe continuity drill is waiting for your acknowledgement.";
            case CONTINUITY_DRILL_COMPLETED ->
                    "Your continuity drill report is ready.";
            case CONTINUITY_DRILL_EXPIRED ->
                    "A continuity drill ended before every response arrived.";
            default -> "A Guardian continuity update is ready.";
        };
    }

    private String safe(String value, String fallback) {
        return value == null || value.isBlank() ? fallback : value.trim();
    }
}
