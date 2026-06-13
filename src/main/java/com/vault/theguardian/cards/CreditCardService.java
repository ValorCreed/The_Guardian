package com.vault.theguardian.cards;
import com.vault.theguardian.user.User;
import org.springframework.stereotype.Service;

import java.util.List;
import java.time.LocalDateTime;


@Service
public class CreditCardService {

    private final CreditCardRepository creditCardRepository;

    public CreditCardService(CreditCardRepository creditCardRepository) {
        this.creditCardRepository = creditCardRepository;
    }
    public CreditCardResponse createCard(User user, CreditCardRequest request) {
        /*
         * Save encrypted card information.
         */
        CreditCardEntity card = CreditCardEntity.builder()
                .user(user)
                .cardName(request.cardName())
                .encryptedCardNumber(request.encryptedCardNumber())
                .encryptedExpiryDate(request.encryptedExpiryDate())
                .encryptedCvv(request.encryptedCvv())
                .encryptedCardholderName(request.encryptedCardholderName())
                .createdAt(LocalDateTime.now())
                .build();

        CreditCardEntity savedCard = creditCardRepository.save(card);

        return toResponse(savedCard);
    }

    public List<CreditCardResponse> getMyCards(User user) {
        /*
         * Only return cards owned by the logged-in user.
         */
        return creditCardRepository.findByUser(user)
                .stream()
                .map(this::toResponse)
                .toList();
    }

    public void deleteCard(User user, Long id) {
        CreditCardEntity card = creditCardRepository.findById(id)
                .orElseThrow(() -> new RuntimeException("Card not found"));

        /*
         * Prevent one user from deleting another user's card.
         */
        if (!card.getUser().getId().equals(user.getId())) {
            throw new RuntimeException("You cannot delete this card");
        }

        creditCardRepository.delete(card);
    }

    private CreditCardResponse toResponse(CreditCardEntity card) {
        return new CreditCardResponse(
                card.getId(),
                card.getCardName(),
                card.getEncryptedCardNumber(),
                card.getEncryptedExpiryDate(),
                card.getEncryptedCvv(),
                card.getEncryptedCardholderName()
        );
    }


}
