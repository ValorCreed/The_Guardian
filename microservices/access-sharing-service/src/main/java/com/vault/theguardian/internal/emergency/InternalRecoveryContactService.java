package com.vault.theguardian.internal.emergency;

import com.vault.theguardian.emergency.EmergencyContactRepository;
import org.springframework.stereotype.Service;

import java.util.List;

@Service
public class InternalRecoveryContactService {
    private final EmergencyContactRepository contactRepository;

    public InternalRecoveryContactService(EmergencyContactRepository contactRepository) {
        this.contactRepository = contactRepository;
    }

    public List<InternalRecoveryContactResponse> findEligibleContacts(Long ownerId) {
        return contactRepository.findByOwnerIdOrderByCreatedAtDesc(ownerId)
                .stream()
                .filter(contact -> contact.isActive() && contact.getContactUserId() != null)
                .map(contact -> new InternalRecoveryContactResponse(
                        contact.getId(),
                        contact.getContactUserId(),
                        clean(contact.getContactName(), contact.getContactEmail()),
                        contact.getContactEmail(),
                        clean(contact.getRelationship(), "Trusted contact")
                ))
                .toList();
    }

    private String clean(String value, String fallback) {
        return value == null || value.isBlank() ? fallback : value.trim();
    }
}
