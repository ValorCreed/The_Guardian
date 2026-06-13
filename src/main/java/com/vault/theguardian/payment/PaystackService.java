package com.vault.theguardian.payment;

import com.vault.theguardian.subscription.Subscription;
import com.vault.theguardian.subscription.SubscriptionPlan;
import com.vault.theguardian.subscription.SubscriptionRepository;
import com.vault.theguardian.user.User;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestClient;

import java.time.LocalDateTime;
import java.util.Map;
import java.util.UUID;

@Service
public class PaystackService {

    private final RestClient restClient;
    private final PaymentRepository paymentRepository;
    private final SubscriptionRepository subscriptionRepository;

    @Value("${paystack.secret.key}")
    private String paystackSecretKey;

    @Value("${paystack.callback.url}")
    private String callbackUrl;

    public PaystackService(
            RestClient restClient,
            PaymentRepository paymentRepository,
            SubscriptionRepository subscriptionRepository
    ) {
        this.restClient = restClient;
        this.paymentRepository = paymentRepository;
        this.subscriptionRepository = subscriptionRepository;
    }

    public InitializePaymentResponse initializePayment(User user, InitializePaymentRequest request) {
        SubscriptionPlan plan = request.plan();

        if (plan == SubscriptionPlan.FREE) {
            throw new RuntimeException("FREE plan does not require payment");
        }

        int amount = getAmountForPlan(plan);

        String reference = "guardian_" + UUID.randomUUID();

        /*
         * Paystack expects amount in the smallest currency unit.
         * For GHS, 2990 means GHS 29.90.
         */
        Map<String, Object> payload = Map.of(
                "email", user.getEmail(),
                "amount", amount,
                "reference", reference,
                "callback_url", callbackUrl
        );

        Map response = restClient.post()
                .uri("https://api.paystack.co/transaction/initialize")
                .header("Authorization", "Bearer " + paystackSecretKey)
                .header("Content-Type", "application/json")
                .body(payload)
                .retrieve()
                .body(Map.class);

        Map data = (Map) response.get("data");

        String authorizationUrl = (String) data.get("authorization_url");
        String accessCode = (String) data.get("access_code");

        Payment payment = Payment.builder()
                .user(user)
                .reference(reference)
                .plan(plan)
                .amount(amount)
                .status("PENDING")
                .authorizationUrl(authorizationUrl)
                .createdAt(LocalDateTime.now())
                .build();

        paymentRepository.save(payment);

        return new InitializePaymentResponse(
                authorizationUrl,
                accessCode,
                reference
        );
    }

    public VerifyPaymentResponse verifyPayment(User user, VerifyPaymentRequest request) {
        Payment payment = paymentRepository.findByReference(request.reference())
                .orElseThrow(() -> new RuntimeException("Payment reference not found"));

        if (!payment.getUser().getId().equals(user.getId())) {
            throw new RuntimeException("You cannot verify another user's payment");
        }

        Map response = restClient.get()
                .uri("https://api.paystack.co/transaction/verify/" + request.reference())
                .header("Authorization", "Bearer " + paystackSecretKey)
                .retrieve()
                .body(Map.class);

        Map data = (Map) response.get("data");

        String status = (String) data.get("status");

        if (!"success".equals(status)) {
            payment.setStatus("FAILED");
            paymentRepository.save(payment);

            return new VerifyPaymentResponse("FAILED", payment.getPlan().name());
        }

        /*
         * Payment is successful, so now we upgrade the subscription.
         */
        Subscription subscription = subscriptionRepository.findByUser(user)
                .orElseThrow(() -> new RuntimeException("Subscription not found"));

        subscription.setPlan(payment.getPlan());
        subscription.setActive(true);

        payment.setStatus("SUCCESS");
        payment.setPaidAt(LocalDateTime.now());

        subscriptionRepository.save(subscription);
        paymentRepository.save(payment);

        return new VerifyPaymentResponse("SUCCESS", payment.getPlan().name());
    }

    private int getAmountForPlan(SubscriptionPlan plan) {
        return switch (plan) {
            case PREMIUM -> 2990;
            case FAMILY -> 6990;
            case FREE -> 0;
        };
    }
}