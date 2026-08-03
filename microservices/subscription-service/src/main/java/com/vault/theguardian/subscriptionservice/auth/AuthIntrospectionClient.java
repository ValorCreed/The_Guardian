package com.vault.theguardian.subscriptionservice.auth;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpHeaders;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;

@Component
public class AuthIntrospectionClient {
    private static final String INTERNAL_KEY_HEADER = "X-Internal-Service-Key";

    private final RestClient restClient;
    private final String internalServiceKey;

    public AuthIntrospectionClient(
            RestClient.Builder builder,
            @Value("${services.auth.url}") String authServiceUrl,
            @Value("${internal.service.key}") String internalServiceKey
    ) {
        this.restClient = builder.baseUrl(authServiceUrl).build();
        this.internalServiceKey = internalServiceKey;
    }

    public TokenIntrospectionResponse introspect(String bearerToken) {
        try {
            TokenIntrospectionResponse response = restClient.post()
                    .uri("/internal/auth/introspect")
                    .header(HttpHeaders.AUTHORIZATION, "Bearer " + bearerToken)
                    .header(INTERNAL_KEY_HEADER, internalServiceKey)
                    .retrieve()
                    .body(TokenIntrospectionResponse.class);

            return response == null
                    ? new TokenIntrospectionResponse(false, null, null, null, null,false,false)
                    : response;
        } catch (RestClientException exception) {
            throw new AuthServiceUnavailableException(
                    "Auth Service could not validate the access token.", exception
            );
        }
    }
}
