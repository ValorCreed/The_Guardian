package com.vault.theguardian.cards;

import com.vault.theguardian.user.User;
import jakarta.validation.Valid;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/vault/cards")
@CrossOrigin
public class CreditCardController {

    private final CreditCardService creditCardService;

    public CreditCardController(CreditCardService creditCardService) {
        this.creditCardService = creditCardService;
    }

    @PostMapping
    public CreditCardResponse createCard(
            @AuthenticationPrincipal User user,
            @Valid @RequestBody CreditCardRequest request
    ) {
        return creditCardService.createCard(user, request);
    }

    @GetMapping
    public List<CreditCardResponse> getMyCards(
            @AuthenticationPrincipal User user
    ) {
        return creditCardService.getMyCards(user);
    }

    @GetMapping("/{id}")
    public CreditCardResponse getCard(
            @AuthenticationPrincipal User user,
            @PathVariable Long id
    ) {
        return creditCardService.getCard(user, id);
    }

    @PutMapping("/{id}")
    public CreditCardResponse updateCard(
            @AuthenticationPrincipal User user,
            @PathVariable Long id,
            @Valid @RequestBody CreditCardRequest request
    ) {
        return creditCardService.updateCard(user, id, request);
    }

    @DeleteMapping("/{id}")
    public void deleteCard(
            @AuthenticationPrincipal User user,
            @PathVariable Long id
    ) {
        creditCardService.deleteCard(user, id);
    }
}
