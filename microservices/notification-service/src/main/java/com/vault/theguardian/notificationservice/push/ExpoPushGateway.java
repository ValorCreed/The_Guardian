package com.vault.theguardian.notificationservice.push;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpHeaders;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

@Component
public class ExpoPushGateway {
    private final RestClient client;
    private final String accessToken;

    public ExpoPushGateway(
            RestClient.Builder builder,
            @Value("${expo.push.url:https://exp.host/--/api/v2}") String expoPushUrl,
            @Value("${expo.push.access-token:}") String accessToken
    ) {
        this.client = builder.baseUrl(expoPushUrl).build();
        this.accessToken = accessToken == null ? "" : accessToken.trim();
    }

    public TicketResult send(
            PushToken token,
            PushDeliveryAttempt attempt
    ) {
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("to", token.getExpoPushToken());
        payload.put("title", attempt.getPushTitle());
        payload.put("body", attempt.getPushBody());
        payload.put("sound", "default");
        payload.put(
                "priority",
                attempt.getUrgency() == PushUrgency.CRITICAL ? "high" : "default"
        );
        payload.put("channelId", attempt.getChannelId());
        payload.put("color", "#0B8FAC");
        payload.put("data", Map.of(
                "notificationId", String.valueOf(attempt.getNotificationId()),
                "type", attempt.getNotificationType(),
                "route", attempt.getActionRoute() == null ? "" : attempt.getActionRoute()
        ));

        RestClient.RequestBodySpec request = client.post()
                .uri("/push/send")
                .header(HttpHeaders.CONTENT_TYPE, "application/json")
                .header(HttpHeaders.ACCEPT, "application/json");

        if (!accessToken.isBlank()) {
            request.header(HttpHeaders.AUTHORIZATION, "Bearer " + accessToken);
        }

        Map<?, ?> response = request.body(payload)
                .retrieve()
                .body(Map.class);

        Map<?, ?> ticket = firstTicket(response == null ? null : response.get("data"));
        if (ticket == null) {
            return TicketResult.error(
                    "INVALID_EXPO_RESPONSE",
                    "Expo returned no push ticket."
            );
        }

        String status = value(ticket.get("status"));
        if ("ok".equalsIgnoreCase(status)) {
            String id = value(ticket.get("id"));
            return id.isBlank()
                    ? TicketResult.error(
                    "MISSING_TICKET_ID",
                    "Expo accepted the push without a ticket id."
            )
                    : TicketResult.ok(id);
        }

        String message = fallback(
                value(ticket.get("message")),
                "Expo rejected the notification."
        );
        String code = "EXPO_REJECTED";
        Object detailsValue = ticket.get("details");
        if (detailsValue instanceof Map<?, ?> details) {
            code = fallback(value(details.get("error")), code);
        }

        return TicketResult.error(code, message);
    }

    public Map<String, ReceiptResult> receipts(List<String> ticketIds) {
        if (ticketIds == null || ticketIds.isEmpty()) return Map.of();

        RestClient.RequestBodySpec request = client.post()
                .uri("/push/getReceipts")
                .header(HttpHeaders.CONTENT_TYPE, "application/json")
                .header(HttpHeaders.ACCEPT, "application/json");

        if (!accessToken.isBlank()) {
            request.header(HttpHeaders.AUTHORIZATION, "Bearer " + accessToken);
        }

        Map<?, ?> response = request.body(Map.of("ids", ticketIds))
                .retrieve()
                .body(Map.class);

        Object dataValue = response == null ? null : response.get("data");
        if (!(dataValue instanceof Map<?, ?> data)) return Map.of();

        Map<String, ReceiptResult> results = new LinkedHashMap<>();
        data.forEach((ticketIdValue, receiptValue) -> {
            if (!(receiptValue instanceof Map<?, ?> receipt)) return;

            String ticketId = value(ticketIdValue);
            String status = value(receipt.get("status"));
            if ("ok".equalsIgnoreCase(status)) {
                results.put(ticketId, ReceiptResult.success());
                return;
            }

            String errorCode = "EXPO_RECEIPT_ERROR";
            Object detailsValue = receipt.get("details");
            if (detailsValue instanceof Map<?, ?> details) {
                errorCode = fallback(value(details.get("error")), errorCode);
            }

            results.put(
                    ticketId,
                    ReceiptResult.error(
                            errorCode,
                            fallback(
                                    value(receipt.get("message")),
                                    "Push delivery failed."
                            )
                    )
            );
        });
        return results;
    }

    private Map<?, ?> firstTicket(Object dataValue) {
        if (dataValue instanceof Map<?, ?> map) return map;
        if (dataValue instanceof List<?> list
                && !list.isEmpty()
                && list.get(0) instanceof Map<?, ?> map) {
            return map;
        }
        return null;
    }

    private String value(Object value) {
        return value == null ? "" : String.valueOf(value).trim();
    }

    private String fallback(String value, String fallback) {
        return value == null || value.isBlank() ? fallback : value;
    }

    public record TicketResult(
            boolean accepted,
            String ticketId,
            String errorCode,
            String errorMessage
    ) {
        static TicketResult ok(String id) {
            return new TicketResult(true, id, null, null);
        }

        static TicketResult error(String code, String message) {
            return new TicketResult(false, null, code, message);
        }
    }

    public record ReceiptResult(
            boolean delivered,
            String errorCode,
            String errorMessage
    ) {
        static ReceiptResult success() {
            return new ReceiptResult(true, null, null);
        }

        static ReceiptResult error(String code, String message) {
            return new ReceiptResult(false, code, message);
        }
    }
}
