package com.vault.theguardian.cards;

import com.vault.theguardian.integration.notification.NotificationClient;
import com.vault.theguardian.user.User;
import com.vault.theguardian.vault.VaultCryptoService;
import org.springframework.stereotype.Service;

import java.time.LocalDateTime;
import java.util.List;

@Service
public class CreditCardService {

    private final CreditCardRepository creditCardRepository;
    private final NotificationClient notificationClient;
    private final VaultCryptoService vaultCryptoService;

    public CreditCardService(CreditCardRepository creditCardRepository,
                             NotificationClient notificationClient,
                             VaultCryptoService vaultCryptoService) {
        this.creditCardRepository = creditCardRepository;
        this.notificationClient = notificationClient;
        this.vaultCryptoService = vaultCryptoService;
    }

    public CreditCardResponse createCard(User user, CreditCardRequest request) {
        CreditCardEntity card = CreditCardEntity.builder()
                .user(user)
                .cardName(cleanCardName(request.cardName()))
                .encryptedCardNumber(vaultCryptoService.encryptNullable(request.encryptedCardNumber()))
                .encryptedExpiryDate(vaultCryptoService.encryptNullable(request.encryptedExpiryDate()))
                .encryptedCvv(vaultCryptoService.encryptNullable(request.encryptedCvv()))
                .encryptedCardholderName(vaultCryptoService.encryptNullable(request.encryptedCardholderName()))
                .createdAt(LocalDateTime.now())
                .build();

        CreditCardEntity savedCard = creditCardRepository.save(card);
        notificationClient.notifyCardAdded(user, savedCard.getCardName());
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

        card.setCardName(cleanCardName(request.cardName()));
        card.setEncryptedCardNumber(vaultCryptoService.encryptNullable(request.encryptedCardNumber()));
        card.setEncryptedExpiryDate(vaultCryptoService.encryptNullable(request.encryptedExpiryDate()));
        card.setEncryptedCvv(vaultCryptoService.encryptNullable(request.encryptedCvv()));
        card.setEncryptedCardholderName(vaultCryptoService.encryptNullable(request.encryptedCardholderName()));

        CreditCardEntity savedCard = creditCardRepository.save(card);
        notificationClient.notifyCardAdded(user, savedCard.getCardName());
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

    private String cleanCardName(String value) {
        if (value == null || value.trim().isBlank()) {
            return "Saved Card";
        }
        return value.trim();
    }

    private CreditCardResponse toResponse(CreditCardEntity card) {
        return new CreditCardResponse(
                card.getId(),
                card.getCardName(),
                vaultCryptoService.decryptForResponse(card.getEncryptedCardNumber()),
                vaultCryptoService.decryptForResponse(card.getEncryptedExpiryDate()),
                vaultCryptoService.decryptForResponse(card.getEncryptedCvv()),
                vaultCryptoService.decryptForResponse(card.getEncryptedCardholderName())
        );
    }
}
