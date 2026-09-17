package com.vault.gateway.coldstart;

import com.sun.net.httpserver.HttpServer;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;

import java.net.InetSocketAddress;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicReference;

import static org.junit.jupiter.api.Assertions.*;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class GatewayColdStartIntegrationTests {
    private static final AtomicInteger healthCalls = new AtomicInteger();
    private static final AtomicInteger loginCalls = new AtomicInteger();
    private static final AtomicReference<String> received = new AtomicReference<>();
    private static final HttpServer downstream = startDownstream();

    @Value("${local.server.port}")
    int gatewayPort;

    private static HttpServer startDownstream() {
        try {
            var server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
            server.createContext("/actuator/health", exchange -> {
                boolean ready = healthCalls.incrementAndGet() > 3;
                byte[] body = (ready ? "{\"status\":\"UP\"}" : "{\"status\":\"DOWN\"}")
                        .getBytes(StandardCharsets.UTF_8);
                exchange.getResponseHeaders().set("Content-Type", "application/json");
                exchange.sendResponseHeaders(ready ? 200 : 503, body.length);
                exchange.getResponseBody().write(body);
                exchange.close();
            });
            server.createContext("/vault/auth/login", exchange -> {
                loginCalls.incrementAndGet();
                received.set(new String(exchange.getRequestBody().readAllBytes(), StandardCharsets.UTF_8));
                byte[] body = "{\"test\":\"signed-in\"}".getBytes(StandardCharsets.UTF_8);
                exchange.getResponseHeaders().set("Content-Type", "application/json");
                exchange.sendResponseHeaders(200, body.length);
                exchange.getResponseBody().write(body);
                exchange.close();
            });
            server.start();
            return server;
        } catch (Exception e) { throw new ExceptionInInitializerError(e); }
    }

    @DynamicPropertySource
    static void properties(DynamicPropertyRegistry properties) {
        String url = "http://127.0.0.1:" + downstream.getAddress().getPort();
        for (String key : new String[]{"AUTH_SERVICE_URL", "EMAIL_SERVICE_URL", "NOTIFICATION_SERVICE_URL"}) {
            properties.add(key, () -> url);
        }
        properties.add("guardian.cold-start.enabled", () -> true);
        properties.add("guardian.cold-start.prewarm-all-on-startup", () -> false);
        properties.add("guardian.cold-start.initial-backoff-ms", () -> 250);
        properties.add("guardian.cold-start.max-backoff-ms", () -> 250);
    }

    @AfterAll
    static void stop() { downstream.stop(0); }

    @Test
    void coldLoginTravelsThroughRealGatewayOnlyOnce() throws Exception {
        String body = "{\"email\":\"test@example.invalid\",\"password\":\"test-only\"}";
        var request = HttpRequest.newBuilder(URI.create("http://127.0.0.1:" + gatewayPort + "/vault/auth/login"))
                .header("Content-Type", "application/json").timeout(Duration.ofSeconds(15))
                .POST(HttpRequest.BodyPublishers.ofString(body)).build();
        try (var client = HttpClient.newHttpClient()) {
            var response = client.send(request, HttpResponse.BodyHandlers.ofString());
            assertEquals(200, response.statusCode());
            assertTrue(response.body().contains("signed-in"));
            assertEquals(body, received.get());
            assertEquals(1, loginCalls.get());
            assertTrue(healthCalls.get() >= 6);
        }
    }
}
