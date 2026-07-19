package com.vault.theguardian.subscriptionservice.payment;

import com.vault.theguardian.subscriptionservice.auth.AuthenticatedUser;
import com.vault.theguardian.subscriptionservice.subscription.SubscriptionPlan;
import com.vault.theguardian.subscriptionservice.subscription.SubscriptionService;
import jakarta.transaction.Transactional;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestClient;

import java.time.LocalDateTime;
import java.util.Map;
import java.util.Objects;
import java.util.UUID;

@Service
public class PaystackService {
    private final RestClient paystackClient;
    private final PaymentRepository paymentRepository;
    private final SubscriptionService subscriptionService;
    private final String paystackSecretKey;
    private final String callbackUrl;

    public PaystackService(
            RestClient.Builder builder,
            PaymentRepository paymentRepository,
            SubscriptionService subscriptionService,
            @Value("${paystack.base-url:https://api.paystack.co}") String paystackBaseUrl,
            @Value("${paystack.secret.key}") String paystackSecretKey,
            @Value("${paystack.callback.url}") String callbackUrl
    ) {
        this.paystackClient = builder.baseUrl(paystackBaseUrl).build();
        this.paymentRepository = paymentRepository;
        this.subscriptionService = subscriptionService;
        this.paystackSecretKey = paystackSecretKey;
        this.callbackUrl = callbackUrl;
    }

    @Transactional
    public InitializePaymentResponse initializePayment(
            AuthenticatedUser user,
            InitializePaymentRequest request
    ) {
        SubscriptionPlan plan = request.plan();
        if (plan == SubscriptionPlan.FREE) {
            throw new IllegalArgumentException("FREE plan does not require payment.");
        }

        int amount = getAmountForPlan(plan);
        String reference = "guardian_" + UUID.randomUUID().toString().replace("-", "");

        Map<String, Object> payload = Map.of(
                "email", user.email(),
                "amount", String.valueOf(amount),
                "reference", reference,
                "callback_url", callbackUrl
        );

        Map<?, ?> response = paystackClient.post()
                .uri("/transaction/initialize")
                .header("Authorization", "Bearer " + paystackSecretKey)
                .header("Content-Type", "application/json")
                .body(payload)
                .retrieve()
                .body(Map.class);

        Map<?, ?> data = requireData(response, "Could not initialize Paystack payment.");
        String authorizationUrl = stringValue(data.get("authorization_url"));
        String accessCode = stringValue(data.get("access_code"));
        String returnedReference = stringValue(data.get("reference"));

        if (authorizationUrl.isBlank() || accessCode.isBlank()) {
            throw new IllegalStateException("Paystack did not return a checkout URL.");
        }
        if (!returnedReference.isBlank() && !reference.equals(returnedReference)) {
            throw new IllegalStateException("Paystack returned an unexpected payment reference.");
        }

        Payment payment = Payment.builder()
                .userId(user.userId())
                .reference(reference)
                .plan(plan)
                .amount(amount)
                .status(PaymentStatus.PENDING)
                .authorizationUrl(authorizationUrl)
                .createdAt(LocalDateTime.now())
                .paidAt(null)
                .build();
        paymentRepository.save(payment);

        return new InitializePaymentResponse(authorizationUrl, accessCode, reference);
    }

    @Transactional
    public VerifyPaymentResponse verifyPayment(
            AuthenticatedUser user,
            VerifyPaymentRequest request
    ) {
        Payment payment = paymentRepository.findByReferenceForUpdate(request.reference())
                .orElseThrow(() -> new IllegalArgumentException("Payment reference not found."));

        if (!Objects.equals(payment.getUserId(), user.userId())) {
            throw new IllegalArgumentException("You cannot verify another user's payment.");
        }
        return verifyPaymentRecord(payment);
    }

    @Transactional
    public VerifyPaymentResponse verifyPaymentFromCallback(String reference) {
        Payment payment = paymentRepository.findByReferenceForUpdate(reference)
                .orElseThrow(() -> new IllegalArgumentException("Payment reference not found."));
        return verifyPaymentRecord(payment);
    }

    private VerifyPaymentResponse verifyPaymentRecord(Payment payment) {
        if (payment.getStatus() == PaymentStatus.SUCCESS) {
            return new VerifyPaymentResponse("SUCCESS", payment.getPlan().name());
        }

        Map<?, ?> response = paystackClient.get()
                .uri("/transaction/verify/{reference}", payment.getReference())
                .header("Authorization", "Bearer " + paystackSecretKey)
                .retrieve()
                .body(Map.class);

        Map<?, ?> data = requireData(response, "Could not verify Paystack payment.");
        String status = stringValue(data.get("status"));
        String returnedReference = stringValue(data.get("reference"));
        long returnedAmount = longValue(data.get("amount"));

        boolean verified = "success".equalsIgnoreCase(status)
                && payment.getReference().equals(returnedReference)
                && returnedAmount == payment.getAmount();

        if (!verified) {
            payment.setStatus(PaymentStatus.FAILED);
            paymentRepository.save(payment);
            return new VerifyPaymentResponse("FAILED", payment.getPlan().name());
        }

        subscriptionService.upgradePlan(payment.getUserId(), payment.getPlan());
        payment.setStatus(PaymentStatus.SUCCESS);
        payment.setPaidAt(LocalDateTime.now());
        paymentRepository.save(payment);
        return new VerifyPaymentResponse("SUCCESS", payment.getPlan().name());
    }

    private Map<?, ?> requireData(Map<?, ?> response, String message) {
        if (response == null || !Boolean.TRUE.equals(response.get("status"))) {
            throw new IllegalStateException(message);
        }
        Object data = response.get("data");
        if (!(data instanceof Map<?, ?> map)) {
            throw new IllegalStateException(message);
        }
        return map;
    }

    private String stringValue(Object value) {
        return value == null ? "" : value.toString();
    }

    private long longValue(Object value) {
        if (value instanceof Number number) return number.longValue();
        try {
            return Long.parseLong(stringValue(value));
        } catch (NumberFormatException exception) {
            return -1;
        }
    }

    private int getAmountForPlan(SubscriptionPlan plan) {
        return switch (plan) {
            case PREMIUM -> 2990;
            case FAMILY -> 6990;
            case FREE -> 0;
        };
    }
}
