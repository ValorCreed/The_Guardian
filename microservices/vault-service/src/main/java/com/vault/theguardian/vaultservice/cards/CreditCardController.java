package com.vault.theguardian.vaultservice.cards;

import com.vault.theguardian.vaultservice.auth.AuthenticatedUser;
import jakarta.validation.Valid;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/vault/cards")
@CrossOrigin
public class CreditCardController {
    private final CreditCardService service;
    public CreditCardController(CreditCardService service) { this.service = service; }

    @PostMapping
    public CreditCardResponse create(@AuthenticationPrincipal AuthenticatedUser user,
                                     @Valid @RequestBody CreditCardRequest request) {
        return service.create(user.userId(), user.isDuress(), request);
    }

    @GetMapping
    public List<CreditCardResponse> list(@AuthenticationPrincipal AuthenticatedUser user) {
        return service.list(user.userId(), user.isDuress());
    }

    @GetMapping("/{id}")
    public CreditCardResponse get(@AuthenticationPrincipal AuthenticatedUser user, @PathVariable Long id) {
        return service.get(user.userId(), user.isDuress(), id);
    }

    @PutMapping("/{id}")
    public CreditCardResponse update(@AuthenticationPrincipal AuthenticatedUser user,
                                     @PathVariable Long id,
                                     @Valid @RequestBody CreditCardRequest request) {
        return service.update(user.userId(), user.isDuress(), id, request);
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> delete(@AuthenticationPrincipal AuthenticatedUser user, @PathVariable Long id) {
        service.delete(user.userId(), user.isDuress(), id);
        return ResponseEntity.noContent().build();
    }
}
