package com.vault.theguardian.user;

import com.vault.theguardian.cards.CreditCardRepository;
import com.vault.theguardian.documents.DocumentRepository;
import com.vault.theguardian.family.FamilyGroup;
import com.vault.theguardian.family.FamilyGroupRepository;
import com.vault.theguardian.family.FamilyMemberRepository;
import com.vault.theguardian.notification.NotificationRepository;
import com.vault.theguardian.payment.PaymentRepository;
import com.vault.theguardian.subscription.SubscriptionRepository;
import com.vault.theguardian.vault.VaultItemRepository;
import jakarta.transaction.Transactional;
import org.springframework.stereotype.Service;

@Service
public class UserService {

    private final UserRepository userRepository;
    private final VaultItemRepository vaultItemRepository;
    private final CreditCardRepository creditCardRepository;
    private final DocumentRepository documentRepository;
    private final SubscriptionRepository subscriptionRepository;
    private final PaymentRepository paymentRepository;
    private final NotificationRepository notificationRepository;
    private final FamilyGroupRepository familyGroupRepository;
    private final FamilyMemberRepository familyMemberRepository;

    public UserService(
            UserRepository userRepository,
            VaultItemRepository vaultItemRepository,
            CreditCardRepository creditCardRepository,
            DocumentRepository documentRepository,
            SubscriptionRepository subscriptionRepository,
            PaymentRepository paymentRepository,
            NotificationRepository notificationRepository,
            FamilyGroupRepository familyGroupRepository,
            FamilyMemberRepository familyMemberRepository
    ) {
        this.userRepository = userRepository;
        this.vaultItemRepository = vaultItemRepository;
        this.creditCardRepository = creditCardRepository;
        this.documentRepository = documentRepository;
        this.subscriptionRepository = subscriptionRepository;
        this.paymentRepository = paymentRepository;
        this.notificationRepository = notificationRepository;
        this.familyGroupRepository = familyGroupRepository;
        this.familyMemberRepository = familyMemberRepository;
    }

    public User getUserByEmail(String email) {
        return userRepository.findByEmail(email)
                .orElseThrow(() -> new RuntimeException("User not found"));
    }

    @Transactional
    public DeleteAccountResponse deleteMyAccount(User user) {
        User managedUser = userRepository.findById(user.getId())
                .orElseThrow(() -> new RuntimeException("User not found"));

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
        paymentRepository.deleteAll(paymentRepository.findByUser(managedUser));

        subscriptionRepository.findByUser(managedUser)
                .ifPresent(subscriptionRepository::delete);

        userRepository.delete(managedUser);

        return new DeleteAccountResponse("Your account and vault data have been deleted.");
    }
}
