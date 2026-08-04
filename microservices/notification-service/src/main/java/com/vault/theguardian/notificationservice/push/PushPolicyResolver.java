package com.vault.theguardian.notificationservice.push;

import com.vault.theguardian.notificationservice.notification.AppNotification;
import com.vault.theguardian.notificationservice.notification.NotificationType;
import org.springframework.stereotype.Component;

import java.util.EnumSet;
import java.util.Set;

@Component
public class PushPolicyResolver {
    private static final Set<NotificationType> SECURITY = EnumSet.of(
            NotificationType.TWO_FACTOR_ENABLED,
            NotificationType.TWO_FACTOR_DISABLED,
            NotificationType.BACKUP_CREATED,
            NotificationType.BACKUP_RESTORED,
            NotificationType.FAMILY_MEMBER_ADDED,
            NotificationType.FAMILY_MEMBER_REMOVED,
            NotificationType.PASSWORD_BREACHED,
            NotificationType.SECURITY_SCAN_ALERT,
            NotificationType.NEW_DEVICE_LOGIN,
            NotificationType.SESSION_REVOKED,
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

    private static final Set<NotificationType> EMERGENCY_RECOVERY = EnumSet.of(
            NotificationType.EMERGENCY_CONTACT_ADDED,
            NotificationType.EMERGENCY_CONTACT_REMOVED,
            NotificationType.EMERGENCY_ACCESS_REQUESTED,
            NotificationType.EMERGENCY_ACCESS_APPROVED,
            NotificationType.EMERGENCY_ACCESS_DENIED,
            NotificationType.EMERGENCY_ACCESS_AVAILABLE,
            NotificationType.EMERGENCY_VAULT_VIEWED,
            NotificationType.SAFETY_CHECK_CONFIGURED,
            NotificationType.SAFETY_CHECK_COMPLETED,
            NotificationType.SAFETY_CHECK_GRACE_STARTED,
            NotificationType.SAFETY_CHECK_TRIGGERED,
            NotificationType.SAFETY_CHECK_DISABLED,
            NotificationType.RECOVERY_KIT_CREATED,
            NotificationType.RECOVERY_CIRCLE_CONFIGURED,
            NotificationType.RECOVERY_CIRCLE_DISABLED,
            NotificationType.RECOVERY_CIRCLE_MEMBER_ADDED,
            NotificationType.RECOVERY_CIRCLE_APPROVAL_REQUESTED,
            NotificationType.RECOVERY_CIRCLE_REQUEST_STARTED,
            NotificationType.RECOVERY_CIRCLE_VOTE_RECORDED,
            NotificationType.RECOVERY_CIRCLE_APPROVED,
            NotificationType.RECOVERY_CIRCLE_DENIED,
            NotificationType.RECOVERY_CIRCLE_CANCELLED,
            NotificationType.RECOVERY_CIRCLE_COMPLETED,
            NotificationType.ESTATE_PLAYBOOK_RELEASED,
            NotificationType.ESTATE_PLAYBOOK_VIEWED,
            NotificationType.ESTATE_PLAYBOOK_COMPLETED,
            NotificationType.ESTATE_PLAYBOOK_CANCELLED
    );

    private static final Set<NotificationType> CONTINUITY = EnumSet.of(
            NotificationType.CONTINUITY_DRILL_STARTED,
            NotificationType.CONTINUITY_DRILL_ACK_REQUESTED,
            NotificationType.CONTINUITY_DRILL_ACKNOWLEDGED,
            NotificationType.CONTINUITY_DRILL_COMPLETED,
            NotificationType.CONTINUITY_DRILL_EXPIRED,
            NotificationType.CONTINUITY_DRILL_CANCELLED
    );

    private static final Set<NotificationType> BILLING = EnumSet.of(
            NotificationType.SUBSCRIPTION_ACTIVATED,
            NotificationType.SUBSCRIPTION_CANCELLED,
            NotificationType.SUBSCRIPTION_EXPIRED
    );

    private static final Set<NotificationType> PRODUCT = EnumSet.of(
            NotificationType.WELCOME
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

        if (SECURITY.contains(type)) {
            return new PushPolicy(
                    true,
                    PushCategory.SECURITY,
                    securityUrgency(type),
                    securityPrivacy(type),
                    "The Guardian • Security",
                    securityBody(type, notification),
                    securityChannel(type)
            );
        }

        if (EMERGENCY_RECOVERY.contains(type)) {
            return new PushPolicy(
                    true,
                    PushCategory.EMERGENCY_RECOVERY,
                    emergencyUrgency(type),
                    PushPrivacy.GENERIC_SENSITIVE,
                    "The Guardian",
                    emergencyBody(type),
                    emergencyChannel(type)
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

        if (PRODUCT.contains(type)) {
            return new PushPolicy(
                    true,
                    PushCategory.PRODUCT,
                    PushUrgency.REMINDER,
                    PushPrivacy.PUBLIC_SAFE,
                    "The Guardian",
                    safe(notification.getMessage(), "A Guardian update is ready."),
                    "guardian-reminders"
            );
        }

        return PushPolicy.inAppOnly();
    }

    private PushUrgency securityUrgency(NotificationType type) {
        return switch (type) {
            case NEW_DEVICE_LOGIN, SESSION_REVOKED, TWO_FACTOR_DISABLED,
                 PASSWORD_BREACHED, RECOVERY_KIT_USED,
                 ACCOUNT_RESET_VAULT_ERASED, INCIDENT_LOCKDOWN_STARTED,
                 DURESS_ALERT -> PushUrgency.CRITICAL;
            default -> PushUrgency.ACTION_REQUIRED;
        };
    }

    private PushPrivacy securityPrivacy(NotificationType type) {
        return switch (type) {
            case NEW_DEVICE_LOGIN, SESSION_REVOKED, TWO_FACTOR_ENABLED,
                 TWO_FACTOR_DISABLED, BACKUP_CREATED, BACKUP_RESTORED,
                 FAMILY_MEMBER_ADDED, FAMILY_MEMBER_REMOVED -> PushPrivacy.PUBLIC_SAFE;
            default -> PushPrivacy.GENERIC_SENSITIVE;
        };
    }

    private String securityChannel(NotificationType type) {
        return securityUrgency(type) == PushUrgency.CRITICAL
                ? "guardian-security"
                : "guardian-actions";
    }

    private String securityBody(NotificationType type, AppNotification notification) {
        return switch (type) {
            case NEW_DEVICE_LOGIN ->
                    "A Guardian sign-in was detected. Review trusted devices if needed.";
            case SESSION_REVOKED -> "A Guardian device session was revoked.";
            case TWO_FACTOR_ENABLED -> "Two-factor authentication was enabled.";
            case TWO_FACTOR_DISABLED ->
                    "Two-factor authentication was disabled. Review this change.";
            case BACKUP_CREATED -> "Your encrypted Guardian backup was created.";
            case BACKUP_RESTORED -> "Your encrypted Guardian backup was restored.";
            case FAMILY_MEMBER_ADDED, FAMILY_MEMBER_REMOVED ->
                    safe(notification.getMessage(), "Your Guardian family access changed.");
            case PASSWORD_BREACHED -> "A critical vault risk needs your attention.";
            case SECURITY_SCAN_ALERT -> "Your latest vault security scan needs attention.";
            case RECOVERY_KIT_USED, RECOVERY_KIT_REVOKED,
                 ACCOUNT_RESET_VAULT_ERASED ->
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

    private PushUrgency emergencyUrgency(NotificationType type) {
        return switch (type) {
            case SAFETY_CHECK_GRACE_STARTED, RECOVERY_CIRCLE_APPROVAL_REQUESTED,
                 EMERGENCY_ACCESS_REQUESTED -> PushUrgency.ACTION_REQUIRED;
            default -> PushUrgency.REMINDER;
        };
    }

    private String emergencyChannel(NotificationType type) {
        return type == NotificationType.SAFETY_CHECK_GRACE_STARTED
                ? "guardian-security"
                : "guardian-actions";
    }

    private String emergencyBody(NotificationType type) {
        return switch (type) {
            case EMERGENCY_CONTACT_ADDED, EMERGENCY_CONTACT_REMOVED ->
                    "Your Guardian emergency-contact settings changed.";
            case EMERGENCY_ACCESS_REQUESTED ->
                    "A trusted-contact request needs your decision.";
            case EMERGENCY_ACCESS_APPROVED, EMERGENCY_ACCESS_AVAILABLE ->
                    "An emergency-access update is ready in Guardian.";
            case EMERGENCY_ACCESS_DENIED ->
                    "An emergency-access request was updated.";
            case EMERGENCY_VAULT_VIEWED ->
                    "Your protected emergency vault was accessed.";
            case SAFETY_CHECK_CONFIGURED, SAFETY_CHECK_COMPLETED,
                 SAFETY_CHECK_DISABLED -> "Your Guardian Safety Check was updated.";
            case SAFETY_CHECK_GRACE_STARTED ->
                    "Your Safety Check needs a check-in now.";
            case RECOVERY_KIT_CREATED ->
                    "Your Guardian recovery kit was created.";
            case RECOVERY_CIRCLE_CONFIGURED, RECOVERY_CIRCLE_DISABLED,
                 RECOVERY_CIRCLE_MEMBER_ADDED ->
                    "Your Recovery Circle settings changed.";
            case RECOVERY_CIRCLE_APPROVAL_REQUESTED ->
                    "A Recovery Circle request needs your decision.";
            case RECOVERY_CIRCLE_REQUEST_STARTED, RECOVERY_CIRCLE_VOTE_RECORDED ->
                    "A Recovery Circle request was updated.";
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
            case ESTATE_PLAYBOOK_VIEWED, ESTATE_PLAYBOOK_COMPLETED ->
                    "A protected Guardian release was updated.";
            case ESTATE_PLAYBOOK_CANCELLED ->
                    "A protected Guardian release was cancelled.";
            default -> "Guardian needs your attention.";
        };
    }

    private String continuityBody(NotificationType type) {
        return switch (type) {
            case CONTINUITY_DRILL_STARTED -> "A Guardian continuity drill started.";
            case CONTINUITY_DRILL_ACK_REQUESTED ->
                    "A safe continuity drill is waiting for your acknowledgement.";
            case CONTINUITY_DRILL_ACKNOWLEDGED ->
                    "A continuity-drill participant acknowledged the request.";
            case CONTINUITY_DRILL_COMPLETED ->
                    "Your continuity drill report is ready.";
            case CONTINUITY_DRILL_EXPIRED ->
                    "A continuity drill ended before every response arrived.";
            case CONTINUITY_DRILL_CANCELLED ->
                    "A Guardian continuity drill was cancelled.";
            default -> "A Guardian continuity update is ready.";
        };
    }

    private String safe(String value, String fallback) {
        return value == null || value.isBlank() ? fallback : value.trim();
    }
}
