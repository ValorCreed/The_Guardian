package com.vault.theguardian.backuprecovery.auth;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;
import org.springframework.web.client.RestClientResponseException;
import org.springframework.web.server.ResponseStatusException;

@Component
public class AuthClient {
    private static final String INTERNAL_KEY_HEADER = "X-Internal-Service-Key";

    private final RestClient restClient;
    private final String internalServiceKey;
    private final ObjectMapper objectMapper;

    public AuthClient(
            RestClient.Builder builder,
            ObjectMapper objectMapper,
            @Value("${services.auth.url}") String authServiceUrl,
            @Value("${internal.service.key}") String internalServiceKey
    ) {
        this.restClient = builder.baseUrl(authServiceUrl).build();
        this.internalServiceKey = internalServiceKey;
        this.objectMapper = objectMapper;
    }

    public TokenIntrospectionResponse introspect(String token) {
        try {
            TokenIntrospectionResponse response = restClient.post()
                    .uri("/internal/auth/introspect")
                    .header(INTERNAL_KEY_HEADER, internalServiceKey)
                    .header(HttpHeaders.AUTHORIZATION, "Bearer " + token)
                    .retrieve()
                    .body(TokenIntrospectionResponse.class);

            return response == null
                    ? new TokenIntrospectionResponse(false, null, null)
                    : response;
        } catch (RestClientException exception) {
            throw new AuthServiceUnavailableException(
                    "Auth Service could not validate the session.", exception
            );
        }
    }

    public InternalUserResponse requireUser(Long userId) {
        try {
            InternalUserResponse response = restClient.get()
                    .uri("/internal/users/{userId}", userId)
                    .header(INTERNAL_KEY_HEADER, internalServiceKey)
                    .retrieve()
                    .body(InternalUserResponse.class);

            if (response == null) {
                throw new ResponseStatusException(HttpStatus.NOT_FOUND, "User account not found.");
            }
            return response;
        } catch (RestClientResponseException exception) {
            throw translate(exception, "Auth Service could not resolve the user account.");
        } catch (ResponseStatusException exception) {
            throw exception;
        } catch (RestClientException exception) {
            throw unavailable(exception);
        }
    }

    public boolean verifyPassword(Long userId, String password) {
        try {
            PasswordVerificationResponse response = restClient.post()
                    .uri("/internal/recovery/users/{userId}/verify-password", userId)
                    .header(INTERNAL_KEY_HEADER, internalServiceKey)
                    .body(new VerifyPasswordRequest(password))
                    .retrieve()
                    .body(PasswordVerificationResponse.class);
            return response != null && response.valid();
        } catch (RestClientResponseException exception) {
            throw translate(exception, "Auth Service could not verify the account password.");
        } catch (RestClientException exception) {
            throw unavailable(exception);
        }
    }

    public AccountResetValidationResponse validateAccountReset(String email, String resetCode) {
        try {
            AccountResetValidationResponse response = restClient.post()
                    .uri("/internal/recovery/account-reset/validate")
                    .header(INTERNAL_KEY_HEADER, internalServiceKey)
                    .body(new ValidateAccountResetRequest(email, resetCode))
                    .retrieve()
                    .body(AccountResetValidationResponse.class);
            if (response == null || response.userId() == null) throw unavailable(null);
            return response;
        } catch (RestClientResponseException exception) {
            throw translate(exception, "Could not validate the account reset request.");
        } catch (RestClientException exception) {
            throw unavailable(exception);
        }
    }

    public void resetPassword(Long userId, String newPassword) {
        try {
            restClient.post()
                    .uri("/internal/recovery/users/{userId}/reset-password", userId)
                    .header(INTERNAL_KEY_HEADER, internalServiceKey)
                    .body(new ResetPasswordRequest(newPassword))
                    .retrieve()
                    .toBodilessEntity();
        } catch (RestClientResponseException exception) {
            throw translate(exception, "Could not reset the account password.");
        } catch (RestClientException exception) {
            throw unavailable(exception);
        }
    }

    public AccountResetValidationResponse completeAccountReset(
            String email,
            String resetCode,
            String newPassword
    ) {
        try {
            AccountResetValidationResponse response = restClient.post()
                    .uri("/internal/recovery/account-reset/complete")
                    .header(INTERNAL_KEY_HEADER, internalServiceKey)
                    .body(new CompleteAccountResetRequest(email, resetCode, newPassword))
                    .retrieve()
                    .body(AccountResetValidationResponse.class);
            if (response == null || response.userId() == null) throw unavailable(null);
            return response;
        } catch (RestClientResponseException exception) {
            throw translate(exception, "Could not complete the account reset.");
        } catch (RestClientException exception) {
            throw unavailable(exception);
        }
    }

    private ResponseStatusException translate(
            RestClientResponseException exception,
            String fallback
    ) {
        String message = extractMessage(exception.getResponseBodyAsString(), fallback);
        return new ResponseStatusException(exception.getStatusCode(), message, exception);
    }

    private String extractMessage(String body, String fallback) {
        if (body == null || body.isBlank()) return fallback;
        try {
            JsonNode json = objectMapper.readTree(body);
            JsonNode message = json.get("message");
            if (message != null && !message.asText().isBlank()) return message.asText();
        } catch (Exception ignored) {
        }
        return fallback;
    }

    private ResponseStatusException unavailable(Throwable cause) {
        return new ResponseStatusException(
                HttpStatus.SERVICE_UNAVAILABLE,
                "Auth Service is temporarily unavailable.",
                cause
        );
    }

    private record VerifyPasswordRequest(String password) {}
    private record ValidateAccountResetRequest(String email, String resetCode) {}
    private record ResetPasswordRequest(String newPassword) {}
    private record CompleteAccountResetRequest(
            String email,
            String resetCode,
            String newPassword
    ) {}
}
