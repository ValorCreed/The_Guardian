package com.vault.theguardian.backuprecovery.access;

import java.util.List;

public record FamilyBackupResponse(
        boolean familyAdmin,
        Long adminGroupId,
        Long memberGroupId,
        List<FamilyBackupMember> members,
        int familyMemberCount
) {}
