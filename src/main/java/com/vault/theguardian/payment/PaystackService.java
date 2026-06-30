package com.vault.theguardian.payment;

import com.vault.theguardian.subscription.SubscriptionPlan;
import com.vault.theguardian.subscription.SubscriptionService;
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
    private final SubscriptionService subscriptionService;

    @Value("${paystack.secret.key}")
    private String paystackSecretKey;

    @Value("${paystack.callback.url}")
    private String callbackUrl;

    public PaystackService(
            RestClient restClient,
            PaymentRepository paymentRepository,
            SubscriptionService subscriptionService
    ) {
        this.restClient = restClient;
        this.paymentRepository = paymentRepository;
        this.subscriptionService = subscriptionService;
    }

    public InitializePaymentResponse initializePayment(User user, InitializePaymentRequest request) {
        SubscriptionPlan plan = request.plan();

        if (plan == SubscriptionPlan.FREE) {
            throw new RuntimeException("FREE plan does not require payment");
        }

        int amount = getAmountForPlan(plan);
        String reference = "guardian_" + UUID.randomUUID();

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

        if (response == null || response.get("data") == null) {
            throw new RuntimeException("Could not initialize Paystack payment");
        }

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

        return verifyPaymentRecord(payment);
    }

    public VerifyPaymentResponse verifyPaymentFromCallback(String reference) {
        Payment payment = paymentRepository.findByReference(reference)
                .orElseThrow(() -> new RuntimeException("Payment reference not found"));

        return verifyPaymentRecord(payment);
    }

    private VerifyPaymentResponse verifyPaymentRecord(Payment payment) {
        if ("SUCCESS".equalsIgnoreCase(payment.getStatus())) {
            return new VerifyPaymentResponse("SUCCESS", payment.getPlan().name());
        }

        Map response = restClient.get()
                .uri("https://api.paystack.co/transaction/verify/" + payment.getReference())
                .header("Authorization", "Bearer " + paystackSecretKey)
                .retrieve()
                .body(Map.class);

        if (response == null || response.get("data") == null) {
            payment.setStatus("FAILED");
            paymentRepository.save(payment);

            return new VerifyPaymentResponse("FAILED", payment.getPlan().name());
        }

        Map data = (Map) response.get("data");
        String status = (String) data.get("status");

        if (!"success".equalsIgnoreCase(status)) {
            payment.setStatus("FAILED");
            paymentRepository.save(payment);

            return new VerifyPaymentResponse("FAILED", payment.getPlan().name());
        }

        subscriptionService.upgradePlan(payment.getUser(), payment.getPlan());

        payment.setStatus("SUCCESS");
        payment.setPaidAt(LocalDateTime.now());
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