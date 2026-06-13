package com.vault.theguardian.payment;

import com.vault.theguardian.user.User;
import jakarta.validation.Valid;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/vault/payments")
@CrossOrigin
public class PaymentController {

    private final PaystackService paystackService;

    public PaymentController(PaystackService paystackService) {
        this.paystackService = paystackService;
    }

    @PostMapping("/initialize")
    public InitializePaymentResponse initializePayment(
            @AuthenticationPrincipal User user,
            @Valid @RequestBody InitializePaymentRequest request
    ) {
        /*
         * User must be logged in.
         * This creates a Paystack transaction and returns authorizationUrl.
         */
        return paystackService.initializePayment(user, request);
    }

    @PostMapping("/verify")
    public VerifyPaymentResponse verifyPayment(
            @AuthenticationPrincipal User user,
            @Valid @RequestBody VerifyPaymentRequest request
    ) {
        /*
         * User must be logged in.
         * This verifies payment and upgrades plan only if successful.
         */
        return paystackService.verifyPayment(user, request);
    }

    //After payment, Paystack redirects the user and verifies the payment
    @GetMapping("/callback")
    public String paymentCallback(@RequestParam String reference){
        return "Payment received,return to The Guardian. Reference:"+ reference;

    }
}
