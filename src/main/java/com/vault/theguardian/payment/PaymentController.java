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
        return paystackService.initializePayment(user, request);
    }

    @PostMapping("/verify")
    public VerifyPaymentResponse verifyPayment(
            @AuthenticationPrincipal User user,
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
        String appLink = "theguardian://subscription?payment=" + result.status().toLowerCase() + "&reference=" + reference;

        return """
                <!DOCTYPE html>
                <html lang="en">
                <head>
                    <meta charset="UTF-8" />
                    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
                    <title>%s</title>

                    <style>
                        * {
                            box-sizing: border-box;
                        }

                        body {
                            margin: 0;
                            min-height: 100vh;
                            display: flex;
                            align-items: center;
                            justify-content: center;
                            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif;
                            background:
                                radial-gradient(circle at top left, rgba(34, 197, 94, 0.24), transparent 34%%),
                                radial-gradient(circle at bottom right, rgba(20, 83, 45, 0.35), transparent 40%%),
                                linear-gradient(135deg, #020806 0%%, #061A12 45%%, #0B2A1D 100%%);
                            color: #FFFFFF;
                            padding: 24px;
                        }

                        .card {
                            width: 100%%;
                            max-width: 440px;
                            background: rgba(255, 255, 255, 0.08);
                            border: 1px solid rgba(255, 255, 255, 0.14);
                            border-radius: 30px;
                            padding: 32px 24px;
                            text-align: center;
                            box-shadow: 0 28px 90px rgba(0, 0, 0, 0.48);
                            backdrop-filter: blur(18px);
                        }

                        .brand {
                            width: 76px;
                            height: 76px;
                            border-radius: 24px;
                            background: linear-gradient(135deg, #16A34A, #22C55E);
                            display: flex;
                            align-items: center;
                            justify-content: center;
                            margin: 0 auto 20px;
                            font-size: 34px;
                            font-weight: 900;
                            color: #FFFFFF;
                            letter-spacing: -1px;
                        }

                        .status {
                            width: 72px;
                            height: 72px;
                            border-radius: 50%%;
                            background: %s;
                            display: flex;
                            align-items: center;
                            justify-content: center;
                            margin: 0 auto 18px;
                            font-size: 40px;
                            font-weight: 900;
                            box-shadow: 0 14px 35px rgba(0, 0, 0, 0.28);
                        }

                        h1 {
                            font-size: 29px;
                            margin: 0 0 10px;
                            letter-spacing: -0.5px;
                        }

                        p {
                            color: rgba(255, 255, 255, 0.78);
                            font-size: 15px;
                            line-height: 1.6;
                            margin: 0 0 22px;
                        }

                        .reference {
                            background: rgba(255, 255, 255, 0.08);
                            border: 1px solid rgba(255, 255, 255, 0.10);
                            border-radius: 16px;
                            padding: 12px;
                            margin-bottom: 22px;
                            color: rgba(255, 255, 255, 0.68);
                            font-size: 12px;
                            word-break: break-all;
                        }

                        .button {
                            display: block;
                            width: 100%%;
                            text-decoration: none;
                            background: linear-gradient(135deg, #16A34A, #22C55E);
                            color: #FFFFFF;
                            font-weight: 900;
                            padding: 16px 18px;
                            border-radius: 999px;
                            font-size: 15px;
                            box-shadow: 0 12px 28px rgba(34, 197, 94, 0.24);
                        }

                        .hint {
                            margin-top: 14px;
                            font-size: 12px;
                            line-height: 1.5;
                            color: rgba(255, 255, 255, 0.56);
                        }
                    </style>
                </head>

                <body>
                    <main class="card">
                        <div class="brand">G</div>
                        <div class="status">%s</div>

                        <h1>%s</h1>

                        <p>%s</p>

                        <div class="reference">
                            Reference: %s
                        </div>

                        <a class="button" href="%s">
                            Return to The Guardian
                        </a>

                        <div class="hint">
                            If the button does not open the app, open The Guardian manually and refresh your subscription page.
                        </div>
                    </main>
                </body>
                </html>
                """.formatted(
                title,
                statusColor,
                icon,
                title,
                message,
                reference,
                appLink
        );
    }
}