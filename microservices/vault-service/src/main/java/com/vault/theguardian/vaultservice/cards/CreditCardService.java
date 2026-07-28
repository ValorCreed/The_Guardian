package com.vault.theguardian.vaultservice.cards;

import com.vault.theguardian.vaultservice.notification.NotificationClient;
import com.vault.theguardian.vaultservice.vault.VaultCryptoService;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

import java.time.LocalDateTime;
import java.util.List;

@Service
public class CreditCardService {
    private final CreditCardRepository repository;
    private final NotificationClient notificationClient;
    private final VaultCryptoService cryptoService;

    public CreditCardService(CreditCardRepository repository,
                             NotificationClient notificationClient,
                             VaultCryptoService cryptoService) {
        this.repository = repository;
        this.notificationClient = notificationClient;
        this.cryptoService = cryptoService;
    }

    public CreditCardResponse create(Long userId, CreditCardRequest request) {
        CreditCardEntity card = CreditCardEntity.builder()
                .userId(userId)
                .cardName(cleanName(request.cardName()))
                .encryptedCardNumber(cryptoService.encryptNullable(request.encryptedCardNumber()))
                .encryptedExpiryDate(cryptoService.encryptNullable(request.encryptedExpiryDate()))
                .encryptedCvv(cryptoService.encryptNullable(request.encryptedCvv()))
                .encryptedCardholderName(cryptoService.encryptNullable(request.encryptedCardholderName()))
                .encryptedNotes(cryptoService.encryptNullable(request.encryptedNotes()))
                .createdAt(LocalDateTime.now())
                .updatedAt(LocalDateTime.now())
                .build();
        CreditCardEntity saved = repository.save(card);
        notificationClient.notifyCardAdded(userId, saved.getCardName());
        return toResponse(saved);
    }

    public List<CreditCardResponse> list(Long userId) {
        return repository.findByUserIdOrderByCreatedAtDesc(userId).stream().map(this::toResponse).toList();
    }

    public CreditCardResponse get(Long userId, Long id) { return toResponse(owned(userId, id)); }

    public CreditCardResponse update(Long userId, Long id, CreditCardRequest request) {
        CreditCardEntity card = owned(userId, id);
        card.setCardName(cleanName(request.cardName()));
        card.setEncryptedCardNumber(cryptoService.encryptNullable(request.encryptedCardNumber()));
        card.setEncryptedExpiryDate(cryptoService.encryptNullable(request.encryptedExpiryDate()));
        card.setEncryptedCvv(cryptoService.encryptNullable(request.encryptedCvv()));
        card.setEncryptedCardholderName(cryptoService.encryptNullable(request.encryptedCardholderName()));
        card.setEncryptedNotes(cryptoService.encryptNullable(request.encryptedNotes()));
        card.setUpdatedAt(LocalDateTime.now());
        return toResponse(repository.save(card));
    }

    public void delete(Long userId, Long id) { repository.delete(owned(userId, id)); }

    private CreditCardEntity owned(Long userId, Long id) {
        CreditCardEntity card = repository.findById(id)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Card not found."));
        if (!card.getUserId().equals(userId)) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "You cannot access this card.");
        }
        return card;
    }

    private String cleanName(String value) {
        return value == null || value.isBlank() ? "Saved Card" : value.trim();
    }

    private CreditCardResponse toResponse(CreditCardEntity card) {
        return new CreditCardResponse(card.getId(), card.getCardName(),
                cryptoService.decryptForResponse(card.getEncryptedCardNumber()),
                cryptoService.decryptForResponse(card.getEncryptedExpiryDate()),
                cryptoService.decryptForResponse(card.getEncryptedCvv()),
                cryptoService.decryptForResponse(card.getEncryptedCardholderName()),
                cryptoService.decryptForResponse(card.getEncryptedNotes()),
                card.getCreatedAt(),
                card.getUpdatedAt());
    }
}
