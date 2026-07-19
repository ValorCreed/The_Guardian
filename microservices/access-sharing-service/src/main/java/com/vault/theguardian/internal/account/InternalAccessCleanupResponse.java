package com.vault.theguardian.internal.account;

public record InternalAccessCleanupResponse(
        int familyMembershipsDeleted,
        int familyGroupsDeleted,
        int emergencyContactsDeleted,
        int emergencyRequestsDeleted,
        int emergencyAuditLogsDeleted,
        int emergencyContactLinksDetached
) {}
