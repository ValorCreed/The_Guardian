package com.vault.theguardian.internal.account;

import com.vault.theguardian.emergency.*;
import com.vault.theguardian.family.*;
import jakarta.transaction.Transactional;
import org.springframework.stereotype.Service;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;

@Service
public class InternalAccountCleanupService {
    private final FamilyGroupRepository familyGroupRepository;
    private final FamilyMemberRepository familyMemberRepository;
    private final EmergencyContactRepository emergencyContactRepository;
    private final EmergencyAccessRequestRepository emergencyRequestRepository;
    private final EmergencyAccessAuditLogRepository emergencyAuditRepository;

    public InternalAccountCleanupService(
            FamilyGroupRepository familyGroupRepository,
            FamilyMemberRepository familyMemberRepository,
            EmergencyContactRepository emergencyContactRepository,
            EmergencyAccessRequestRepository emergencyRequestRepository,
            EmergencyAccessAuditLogRepository emergencyAuditRepository
    ) {
        this.familyGroupRepository = familyGroupRepository;
        this.familyMemberRepository = familyMemberRepository;
        this.emergencyContactRepository = emergencyContactRepository;
        this.emergencyRequestRepository = emergencyRequestRepository;
        this.emergencyAuditRepository = emergencyAuditRepository;
    }

    @Transactional
    public InternalAccessCleanupResponse deleteUserData(Long userId) {
        List<EmergencyAccessAuditLog> auditLogs =
                emergencyAuditRepository.findByOwnerIdOrActorIdOrderByCreatedAtDesc(userId, userId);

        Map<Long, EmergencyAccessRequest> requestById = new LinkedHashMap<>();
        emergencyRequestRepository.findByOwnerIdOrderByRequestedAtDesc(userId)
                .forEach(request -> requestById.put(request.getId(), request));
        emergencyRequestRepository.findByRequesterIdOrderByRequestedAtDesc(userId)
                .forEach(request -> requestById.put(request.getId(), request));

        List<EmergencyContact> ownedContacts =
                emergencyContactRepository.findByOwnerIdOrderByCreatedAtDesc(userId);
        Set<Long> ownedContactIds = ownedContacts.stream()
                .map(EmergencyContact::getId)
                .collect(Collectors.toSet());

        List<EmergencyContact> linkedContacts = emergencyContactRepository
                .findByContactUserId(userId)
                .stream()
                .filter(contact -> !ownedContactIds.contains(contact.getId()))
                .toList();

        Map<Long, FamilyMember> familyMembershipById = new LinkedHashMap<>();
        familyMemberRepository.findByUserId(userId)
                .forEach(member -> familyMembershipById.put(member.getId(), member));

        FamilyGroup ownedGroup = familyGroupRepository.findByAdminId(userId).orElse(null);
        if (ownedGroup != null) {
            familyMemberRepository.findByGroupOrderByJoinedAtAsc(ownedGroup)
                    .forEach(member -> familyMembershipById.put(member.getId(), member));
        }

        /* Child rows are removed before their parent rows. */
        emergencyAuditRepository.deleteAll(auditLogs);
        emergencyRequestRepository.deleteAll(requestById.values());
        emergencyContactRepository.deleteAll(ownedContacts);

        for (EmergencyContact linkedContact : linkedContacts) {
            linkedContact.setContactUserId(null);
        }
        if (!linkedContacts.isEmpty()) {
            emergencyContactRepository.saveAll(linkedContacts);
        }

        familyMemberRepository.deleteAll(familyMembershipById.values());
        if (ownedGroup != null) {
            familyGroupRepository.delete(ownedGroup);
        }

        return new InternalAccessCleanupResponse(
                familyMembershipById.size(),
                ownedGroup == null ? 0 : 1,
                ownedContacts.size(),
                requestById.size(),
                auditLogs.size(),
                linkedContacts.size()
        );
    }
}
