package com.vault.theguardian.internal.family;

import com.vault.theguardian.auth.AuthClient;
import com.vault.theguardian.auth.InternalUserResponse;
import com.vault.theguardian.family.FamilyGroup;
import com.vault.theguardian.family.FamilyGroupRepository;
import com.vault.theguardian.family.FamilyMember;
import com.vault.theguardian.family.FamilyMemberRepository;
import org.springframework.stereotype.Service;

import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.function.Function;
import java.util.stream.Collectors;

@Service
public class InternalFamilyBackupService {
    private final FamilyGroupRepository groupRepository;
    private final FamilyMemberRepository memberRepository;
    private final AuthClient authClient;

    public InternalFamilyBackupService(
            FamilyGroupRepository groupRepository,
            FamilyMemberRepository memberRepository,
            AuthClient authClient
    ) {
        this.groupRepository = groupRepository;
        this.memberRepository = memberRepository;
        this.authClient = authClient;
    }

    public InternalFamilyBackupResponse exportForUser(Long userId) {
        FamilyGroup adminGroup = groupRepository.findByAdminId(userId).orElse(null);
        List<FamilyMember> memberships = memberRepository.findByUserId(userId);
        FamilyGroup memberGroup = memberships.isEmpty() ? null : memberships.get(0).getGroup();

        List<FamilyMember> members = adminGroup == null
                ? memberships
                : memberRepository.findByGroupOrderByJoinedAtAsc(adminGroup);

        Map<Long, InternalUserResponse> users = authClient.findByIds(
                        members.stream().map(FamilyMember::getUserId).toList()
                ).stream()
                .filter(Objects::nonNull)
                .collect(Collectors.toMap(
                        InternalUserResponse::id,
                        Function.identity(),
                        (left, right) -> left
                ));

        List<InternalFamilyBackupMember> responses = members.stream()
                .map(member -> toResponse(member, users.get(member.getUserId())))
                .toList();

        return new InternalFamilyBackupResponse(
                adminGroup != null,
                adminGroup == null ? null : adminGroup.getId(),
                memberGroup == null ? null : memberGroup.getId(),
                responses,
                responses.size()
        );
    }

    private InternalFamilyBackupMember toResponse(
            FamilyMember member,
            InternalUserResponse user
    ) {
        return new InternalFamilyBackupMember(
                member.getId(),
                member.getGroup() == null ? null : member.getGroup().getId(),
                member.getUserId(),
                user == null ? "" : safe(user.fullName()),
                user == null ? "" : safe(user.email()),
                member.getJoinedAt(),
                member.isSharePasswords(),
                member.isShareCards(),
                member.isShareDocuments(),
                member.isShareNotes()
        );
    }

    private String safe(String value) {
        return value == null ? "" : value;
    }
}
