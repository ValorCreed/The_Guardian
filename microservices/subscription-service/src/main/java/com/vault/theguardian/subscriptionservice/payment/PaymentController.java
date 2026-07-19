package com.vault.theguardian.subscriptionservice.payment;

import com.vault.theguardian.subscriptionservice.auth.AuthenticatedUser;
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
            @AuthenticationPrincipal AuthenticatedUser user,
            @Valid @RequestBody InitializePaymentRequest request
    ) {
        return paystackService.initializePayment(user, request);
    }

    @PostMapping("/verify")
    public VerifyPaymentResponse verifyPayment(
            @AuthenticationPrincipal AuthenticatedUser user,
            @Valid @RequestBody VerifyPaymentRequest request
    ) {
        return paystackService.verifyPayment(user, request);
    }

    @GetMapping(value = "/callback", produces = "text/html")
    public String paymentCallback(@RequestParam String reference) {
        VerifyPaymentResponse result = paystackService.verifyPaymentFromCallback(reference);
        boolean success = "SUCCESS".equalsIgnoreCase(result.status());
        String title = success ? "Payment Successful" : "Payment Failed";
        String message = success
                ? "Your " + result.plan() + " subscription has been activated. Return to The Guardian and refresh your subscription page."
                : "We could not confirm this payment. Please return to the app and try again.";
        String icon = success ? "✓" : "!";
        String statusColor = success ? "#16A34A" : "#EF4444";
        String appLink = "theguardian://subscription?payment="
                + result.status().toLowerCase() + "&reference=" + reference;

        return """
                <!DOCTYPE html>
                <html lang="en">
                <head>
                    <meta charset="UTF-8" />
                    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
                    <title>%s</title>
                    <style>
                        * { box-sizing: border-box; }
                        body { margin: 0; min-height: 100vh; display: flex; align-items: center; justify-content: center;
                               font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif;
                               background: #071D27; color: #FFFFFF; padding: 24px; }
                        .card { width: 100%%; max-width: 480px; text-align: center; padding: 36px 28px;
                                border-radius: 28px; background: #0D3342; box-shadow: 0 24px 70px rgba(0,0,0,.35); }
                        .status { width: 72px; height: 72px; border-radius: 50%%; background: %s; display: flex;
                                  align-items: center; justify-content: center; margin: 0 auto 18px; font-size: 40px; font-weight: 900; }
                        h1 { margin: 0 0 10px; font-size: 29px; }
                        p { color: rgba(255,255,255,.78); line-height: 1.6; }
                        .reference { margin: 20px 0; padding: 12px; border-radius: 14px; background: rgba(255,255,255,.08);
                                     word-break: break-all; font-size: 12px; }
                        .button { display: block; text-decoration: none; color: white; background: #16A34A; padding: 15px;
                                  border-radius: 999px; font-weight: 800; }
                    </style>
                </head>
                <body>
                    <main class="card">
                        <div class="status">%s</div>
                        <h1>%s</h1>
                        <p>%s</p>
                        <div class="reference">Reference: %s</div>
                        <a class="button" href="%s">Return to The Guardian</a>
                    </main>
                </body>
                </html>
                """.formatted(title, statusColor, icon, title, message, reference, appLink);
    }
}
