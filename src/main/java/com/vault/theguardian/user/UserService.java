package com.vault.theguardian.user;

import com.vault.theguardian.cards.CreditCardRepository;
import com.vault.theguardian.documents.DocumentRepository;
import com.vault.theguardian.emergency.EmergencyAccessAuditLogRepository;
import com.vault.theguardian.emergency.EmergencyAccessRequestRepository;
import com.vault.theguardian.emergency.EmergencyContactRepository;
import com.vault.theguardian.family.FamilyGroup;
import com.vault.theguardian.family.FamilyGroupRepository;
import com.vault.theguardian.family.FamilyMemberRepository;
import com.vault.theguardian.notes.SecureNoteRepository;
import com.vault.theguardian.notification.NotificationRepository;
import com.vault.theguardian.payment.PaymentRepository;
import com.vault.theguardian.subscription.SubscriptionRepository;
import com.vault.theguardian.vault.VaultItemRepository;
import jakarta.transaction.Transactional;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;

@Service
public class UserService {

    private final UserRepository userRepository;
    private final VaultItemRepository vaultItemRepository;
    private final CreditCardRepository creditCardRepository;
    private final DocumentRepository documentRepository;
    private final SecureNoteRepository secureNoteRepository;
    private final SubscriptionRepository subscriptionRepository;
    private final PaymentRepository paymentRepository;
    private final NotificationRepository notificationRepository;
    private final FamilyGroupRepository familyGroupRepository;
    private final FamilyMemberRepository familyMemberRepository;
    private final EmergencyContactRepository emergencyContactRepository;
    private final EmergencyAccessRequestRepository emergencyAccessRequestRepository;
    private final EmergencyAccessAuditLogRepository emergencyAccessAuditLogRepository;
    private final PasswordEncoder passwordEncoder;

    public UserService(
            UserRepository userRepository,
            VaultItemRepository vaultItemRepository,
            CreditCardRepository creditCardRepository,
            DocumentRepository documentRepository,
            SecureNoteRepository secureNoteRepository,
            SubscriptionRepository subscriptionRepository,
            PaymentRepository paymentRepository,
            NotificationRepository notificationRepository,
            FamilyGroupRepository familyGroupRepository,
            FamilyMemberRepository familyMemberRepository,
            EmergencyContactRepository emergencyContactRepository,
            EmergencyAccessRequestRepository emergencyAccessRequestRepository,
            EmergencyAccessAuditLogRepository emergencyAccessAuditLogRepository,
            PasswordEncoder passwordEncoder
    ) {
        this.userRepository = userRepository;
        this.vaultItemRepository = vaultItemRepository;
        this.creditCardRepository = creditCardRepository;
        this.documentRepository = documentRepository;
        this.secureNoteRepository = secureNoteRepository;
        this.subscriptionRepository = subscriptionRepository;
        this.paymentRepository = paymentRepository;
        this.notificationRepository = notificationRepository;
        this.familyGroupRepository = familyGroupRepository;
        this.familyMemberRepository = familyMemberRepository;
        this.emergencyContactRepository = emergencyContactRepository;
        this.emergencyAccessRequestRepository = emergencyAccessRequestRepository;
        this.emergencyAccessAuditLogRepository = emergencyAccessAuditLogRepository;
        this.passwordEncoder = passwordEncoder;
    }

    public User getUserByEmail(String email) {
        return userRepository.findByEmail(email)
                .orElseThrow(() -> new RuntimeException("User not found"));
    }

    @Transactional
    public DeleteAccountResponse deleteMyAccount(User user, DeleteAccountRequest request) {
        User managedUser = userRepository.findById(user.getId())
                .orElseThrow(() -> new RuntimeException("User not found"));

        if (request == null || request.password() == null || request.password().isBlank()) {
            throw new RuntimeException("Enter your password to delete your account.");
        }

        boolean passwordMatches = passwordEncoder.matches(
                request.password(),
                managedUser.getPasswordHash()
        );

        if (!passwordMatches) {
            throw new RuntimeException("Incorrect password. Account deletion was blocked.");
        }

        /*
         * Emergency access cleanup comes before user deletion because requests,
         * contacts, and audit logs reference the user as owner/requester/actor.
         */
        emergencyAccessAuditLogRepository.deleteAll(
                emergencyAccessAuditLogRepository.findByOwnerOrActorOrderByCreatedAtDesc(managedUser, managedUser)
        );
        emergencyAccessRequestRepository.deleteAll(
                emergencyAccessRequestRepository.findByOwnerOrderByRequestedAtDesc(managedUser)
        );
        emergencyAccessRequestRepository.deleteAll(
                emergencyAccessRequestRepository.findByRequesterOrderByRequestedAtDesc(managedUser)
        );
        emergencyContactRepository.deleteAll(
                emergencyContactRepository.findByOwnerOrderByCreatedAtDesc(managedUser)
        );

        /*
         * Family cleanup must happen before deleting the user:
         * 1. Remove this user from any family group they joined.
         * 2. If this user owns a family group, remove the group's members.
         * 3. Delete the user's family group.
         */
        familyMemberRepository.deleteAll(familyMemberRepository.findByUser(managedUser));

        FamilyGroup ownGroup = familyGroupRepository.findByAdmin(managedUser).orElse(null);
        if (ownGroup != null) {
            familyMemberRepository.deleteAll(familyMemberRepository.findByGroup(ownGroup));
            familyGroupRepository.delete(ownGroup);
        }

        notificationRepository.deleteAll(notificationRepository.findByUserOrderByCreatedAtDesc(managedUser));
        vaultItemRepository.deleteAll(vaultItemRepository.findByUser(managedUser));
        creditCardRepository.deleteAll(creditCardRepository.findByUser(managedUser));
        documentRepository.deleteAll(documentRepository.findByUser(managedUser));
        secureNoteRepository.deleteAll(secureNoteRepository.findByUserOrderByPinnedDescUpdatedAtDesc(managedUser));
        paymentRepository.deleteAll(paymentRepository.findByUser(managedUser));

        subscriptionRepository.findByUser(managedUser)
                .ifPresent(subscriptionRepository::delete);

        userRepository.delete(managedUser);

        return new DeleteAccountResponse("Your account and vault data have been deleted.");
    }
}
