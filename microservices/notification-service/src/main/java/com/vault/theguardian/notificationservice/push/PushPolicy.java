package com.vault.theguardian.notificationservice.push;

public record PushPolicy(
        boolean push,
        PushCategory category,
        PushUrgency urgency,
        PushPrivacy privacy,
        String title,
        String body,
        String channelId
) {
    public static PushPolicy inAppOnly() {
        return new PushPolicy(
                false,
                PushCategory.PRODUCT,
                PushUrgency.REMINDER,
                PushPrivacy.PUBLIC_SAFE,
                "",
                "",
                "guardian-reminders"
        );
    }
}
