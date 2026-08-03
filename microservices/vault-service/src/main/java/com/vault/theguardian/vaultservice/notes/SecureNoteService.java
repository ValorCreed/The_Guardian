package com.vault.theguardian.vaultservice.notes;

import com.vault.theguardian.vaultservice.common.PlanLimitException;
import com.vault.theguardian.vaultservice.notification.NotificationClient;
import com.vault.theguardian.vaultservice.subscription.SubscriptionClient;
import com.vault.theguardian.vaultservice.vault.VaultCryptoService;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;
import java.time.LocalDateTime;
import java.util.List;

@Service
public class SecureNoteService {
    private final SecureNoteRepository repository; private final SubscriptionClient subscriptions; private final NotificationClient notifications; private final VaultCryptoService crypto;
    public SecureNoteService(SecureNoteRepository repository, SubscriptionClient subscriptions, NotificationClient notifications, VaultCryptoService crypto){this.repository=repository;this.subscriptions=subscriptions;this.notifications=notifications;this.crypto=crypto;}
    public SecureNoteResponse create(Long userId, boolean decoy, SecureNoteRequest request){
        if(!decoy){long count=repository.countByUserIdAndDecoy(userId,false); if(!subscriptions.canCreateSecureNote(userId,count)){long limit=subscriptions.getEntitlements(userId).maxSecureNotes();throw new PlanLimitException("SECURE_NOTE",limit,"Free note limit reached. Upgrade to Premium or Family for unlimited secure notes.");}}
        LocalDateTime now=LocalDateTime.now(); SecureNote saved=repository.save(SecureNote.builder().userId(userId).decoy(decoy).title(cleanTitle(request.title())).category(cleanCategory(request.category())).encryptedContent(crypto.encryptNullable(request.encryptedContent(), decoy)).pinned(Boolean.TRUE.equals(request.pinned())).createdAt(now).updatedAt(now).build());
        if(!decoy)notifications.notifySecureNoteAdded(userId,saved.getTitle()); return toResponse(saved);
    }
    public List<SecureNoteResponse> list(Long userId, boolean decoy){return repository.findByUserIdAndDecoyOrderByPinnedDescUpdatedAtDesc(userId,decoy).stream().map(this::toResponse).toList();}
    public SecureNoteResponse get(Long userId, boolean decoy, Long id){return toResponse(owned(userId,decoy,id));}
    public SecureNoteResponse update(Long userId, boolean decoy, Long id, SecureNoteRequest r){SecureNote n=owned(userId,decoy,id);n.setTitle(cleanTitle(r.title()));n.setCategory(cleanCategory(r.category()));n.setEncryptedContent(crypto.encryptNullable(r.encryptedContent(), decoy));n.setPinned(Boolean.TRUE.equals(r.pinned()));n.setUpdatedAt(LocalDateTime.now());SecureNote saved=repository.save(n);if(!decoy)notifications.notifySecureNoteUpdated(userId,saved.getTitle());return toResponse(saved);}
    public void delete(Long userId, boolean decoy, Long id){SecureNote n=owned(userId,decoy,id);repository.delete(n);if(!decoy)notifications.notifySecureNoteDeleted(userId,n.getTitle());}
    private SecureNote owned(Long userId, boolean decoy, Long id){return repository.findByIdAndUserIdAndDecoy(id,userId,decoy).orElseThrow(()->new ResponseStatusException(HttpStatus.NOT_FOUND,"Secure note not found."));}
    private String cleanTitle(String v){return v==null||v.isBlank()?"Untitled note":v.trim();} private String cleanCategory(String v){return v==null||v.isBlank()?"General":v.trim();}
    private SecureNoteResponse toResponse(SecureNote n){return new SecureNoteResponse(n.getId(),n.getTitle(),n.getCategory(),crypto.decryptForResponse(n.getEncryptedContent(), n.isDecoy()),n.isPinned(),n.getCreatedAt(),n.getUpdatedAt());}
}
