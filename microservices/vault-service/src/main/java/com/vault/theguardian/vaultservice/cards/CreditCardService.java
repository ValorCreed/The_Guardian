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
    private final NotificationClient notifications;
    private final VaultCryptoService crypto;
    public CreditCardService(CreditCardRepository repository, NotificationClient notifications, VaultCryptoService crypto) {
        this.repository=repository; this.notifications=notifications; this.crypto=crypto;
    }
    public CreditCardResponse create(Long userId, boolean decoy, CreditCardRequest request) {
        LocalDateTime now=LocalDateTime.now();
        CreditCardEntity saved=repository.save(CreditCardEntity.builder().userId(userId).decoy(decoy)
                .cardName(cleanName(request.cardName()))
                .encryptedCardNumber(crypto.encryptNullable(request.encryptedCardNumber(), decoy))
                .encryptedExpiryDate(crypto.encryptNullable(request.encryptedExpiryDate(), decoy))
                .encryptedCvv(crypto.encryptNullable(request.encryptedCvv(), decoy))
                .encryptedCardholderName(crypto.encryptNullable(request.encryptedCardholderName(), decoy))
                .encryptedNotes(crypto.encryptNullable(request.encryptedNotes(), decoy))
                .createdAt(now).updatedAt(now).build());
        if (!decoy) notifications.notifyCardAdded(userId,saved.getCardName());
        return toResponse(saved);
    }
    public List<CreditCardResponse> list(Long userId, boolean decoy) { return repository.findByUserIdAndDecoyOrderByCreatedAtDesc(userId,decoy).stream().map(this::toResponse).toList(); }
    public CreditCardResponse get(Long userId, boolean decoy, Long id){return toResponse(owned(userId,decoy,id));}
    public CreditCardResponse update(Long userId, boolean decoy, Long id, CreditCardRequest r){
        CreditCardEntity c=owned(userId,decoy,id); c.setCardName(cleanName(r.cardName()));
        c.setEncryptedCardNumber(crypto.encryptNullable(r.encryptedCardNumber(), decoy)); c.setEncryptedExpiryDate(crypto.encryptNullable(r.encryptedExpiryDate(), decoy));
        c.setEncryptedCvv(crypto.encryptNullable(r.encryptedCvv(), decoy)); c.setEncryptedCardholderName(crypto.encryptNullable(r.encryptedCardholderName(), decoy));
        c.setEncryptedNotes(crypto.encryptNullable(r.encryptedNotes(), decoy)); c.setUpdatedAt(LocalDateTime.now()); return toResponse(repository.save(c));
    }
    public void delete(Long userId, boolean decoy, Long id){repository.delete(owned(userId,decoy,id));}
    private CreditCardEntity owned(Long userId, boolean decoy, Long id){return repository.findByIdAndUserIdAndDecoy(id,userId,decoy).orElseThrow(()->new ResponseStatusException(HttpStatus.NOT_FOUND,"Card not found."));}
    private String cleanName(String v){return v==null||v.isBlank()?"Saved Card":v.trim();}
    private CreditCardResponse toResponse(CreditCardEntity c){return new CreditCardResponse(c.getId(),c.getCardName(),crypto.decryptForResponse(c.getEncryptedCardNumber(), c.isDecoy()),crypto.decryptForResponse(c.getEncryptedExpiryDate(), c.isDecoy()),crypto.decryptForResponse(c.getEncryptedCvv(), c.isDecoy()),crypto.decryptForResponse(c.getEncryptedCardholderName(), c.isDecoy()),crypto.decryptForResponse(c.getEncryptedNotes(), c.isDecoy()),c.getCreatedAt(),c.getUpdatedAt());}
}
