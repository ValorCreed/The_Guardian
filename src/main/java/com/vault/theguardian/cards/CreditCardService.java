package com.vault.theguardian.cards;

import com.vault.theguardian.user.User;
import org.springframework.stereotype.Service;

import java.time.LocalDateTime;
import java.util.List;

@Service
public class CreditCardService {

    private final CreditCardRepository creditCardRepository;

    public CreditCardService(CreditCardRepository creditCardRepository) {
        this.creditCardRepository = creditCardRepository;
    }

    public CreditCardResponse createCard(User user, CreditCardRequest request) {
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
        return creditCardRepository.findByUser(user)
                .stream()
                .map(this::toResponse)
                .toList();
    }

    public CreditCardResponse getCard(User user, Long id) {
        CreditCardEntity card = getOwnedCard(user, id);
        return toResponse(card);
    }

    public CreditCardResponse updateCard(User user, Long id, CreditCardRequest request) {
        CreditCardEntity card = getOwnedCard(user, id);

        card.setCardName(request.cardName());
        card.setEncryptedCardNumber(request.encryptedCardNumber());
        card.setEncryptedExpiryDate(request.encryptedExpiryDate());
        card.setEncryptedCvv(request.encryptedCvv());
        card.setEncryptedCardholderName(request.encryptedCardholderName());

        CreditCardEntity savedCard = creditCardRepository.save(card);
        return toResponse(savedCard);
    }

    public void deleteCard(User user, Long id) {
        CreditCardEntity card = getOwnedCard(user, id);
        creditCardRepository.delete(card);
    }

    private CreditCardEntity getOwnedCard(User user, Long id) {
        CreditCardEntity card = creditCardRepository.findById(id)
                .orElseThrow(() -> new RuntimeException("Card not found"));

        if (!card.getUser().getId().equals(user.getId())) {
            throw new RuntimeException("You cannot access this card");
        }

        return card;
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
