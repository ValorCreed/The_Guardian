package com.vault.theguardian.internal.family;

import java.util.List;

public record InternalFamilyBackupResponse(
        boolean familyAdmin,
        Long adminGroupId,
        Long memberGroupId,
        List<InternalFamilyBackupMember> members,
        int familyMemberCount
) {}
