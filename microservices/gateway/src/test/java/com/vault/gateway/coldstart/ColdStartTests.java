package com.vault.gateway.coldstart;

import com.sun.net.httpserver.HttpServer;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;

import java.net.InetSocketAddress;
import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.time.ZonedDateTime;
import java.time.format.DateTimeFormatter;
import java.util.List;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;

import static org.junit.jupiter.api.Assertions.*;

class ColdStartTests {
    private DownstreamServiceRegistry registry(String url) {
        return new DownstreamServiceRegistry(url, url, url, url, url, url, url, url, url, url);
    }

    @Test
    void retryAfterSupportsSecondsAndHttpDatesWithoutFifteenSecondCap() {
        assertEquals(120000, DownstreamWakeCoordinator.parseRetryAfterMillis("120"));
        var date = ZonedDateTime.now(java.time.ZoneOffset.UTC).plusSeconds(120)
                .format(DateTimeFormatter.RFC_1123_DATE_TIME);
        assertTrue(DownstreamWakeCoordinator.parseRetryAfterMillis(date) > 118000);
        assertEquals(0, DownstreamWakeCoordinator.parseRetryAfterMillis("invalid"));
    }

    @Test
    void dependencyCyclesTerminateAndLoginIncludesNotifications() {
        var registry = registry("http://localhost:8081");
        var names = registry.requiredFor(registry.forPath("/vault/auth/login").orElseThrow())
                .stream().map(DownstreamServiceRegistry.DownstreamService::name).toList();
        assertEquals(List.of("auth", "email", "notifications"), names);
        var sharing = registry.requiredFor(registry.byName("sharing").orElseThrow());
        assertEquals(sharing.size(), sharing.stream().map(DownstreamServiceRegistry.DownstreamService::name).distinct().count());
        assertTrue(registry.forPath("/vault/authentication").isEmpty());
    }

    @Test
    void concurrentWaitersShareProbeAndRejectNestedUpStatus() throws Exception {
        var calls = new AtomicInteger();
        var entered = new CountDownLatch(1);
        var release = new CountDownLatch(1);
        var server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        server.createContext("/actuator/health", exchange -> {
            int call = calls.incrementAndGet();
            entered.countDown();
            try { release.await(3, TimeUnit.SECONDS); }
            catch (InterruptedException e) { Thread.currentThread().interrupt(); }
            String body = call == 1 ? "{\"status\":\"DOWN\",\"components\":{\"db\":{\"status\":\"UP\"}}}"
                    : "{\"status\":\"UP\"}";
            byte[] bytes = body.getBytes(StandardCharsets.UTF_8);
            exchange.sendResponseHeaders(200, bytes.length);
            exchange.getResponseBody().write(bytes);
            exchange.close();
        });
        server.start();
        var coordinator = new DownstreamWakeCoordinator(true, 60000, 10000, 1000, 1000, 250, 250);
        try {
            var target = registry("http://127.0.0.1:" + server.getAddress().getPort()).byName("auth").orElseThrow();
            var first = coordinator.wakeAsync(target, "first", "test");
            assertTrue(entered.await(3, TimeUnit.SECONDS));
            assertSame(first, coordinator.wakeAsync(target, "second", "test"));
            release.countDown();
            assertTrue(first.get(5, TimeUnit.SECONDS).ready());
            assertEquals(2, calls.get());
            assertTrue(coordinator.wakeAsync(target, "third", "test").get().ready());
            assertEquals(2, calls.get());
        } finally { release.countDown(); coordinator.shutdown(); server.stop(0); }
    }

    @Test
    void throttledHealthProbeStopsAndSharesCooldownAcrossRequests() throws Exception {
        var calls = new AtomicInteger();
        var firstAt = new java.util.concurrent.atomic.AtomicLong();
        var secondAt = new java.util.concurrent.atomic.AtomicLong();
        var server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        server.createContext("/actuator/health", exchange -> {
            int call = calls.incrementAndGet();
            if (call == 1) {
                firstAt.set(System.nanoTime());
                exchange.getResponseHeaders().add("Retry-After", "2");
                exchange.sendResponseHeaders(429, -1);
            } else {
                secondAt.set(System.nanoTime());
                byte[] body = "{\"status\":\"UP\"}".getBytes(StandardCharsets.UTF_8);
                exchange.sendResponseHeaders(200, body.length);
                exchange.getResponseBody().write(body);
            }
            exchange.close();
        });
        server.start();
        var coordinator = new DownstreamWakeCoordinator(true, 60000, 10000, 1000, 1000, 250, 250);
        try {
            var target = registry("http://127.0.0.1:" + server.getAddress().getPort()).byName("auth").orElseThrow();
            var rejected = coordinator.wakeAsync(target, "test", "test").get(6, TimeUnit.SECONDS);
            assertFalse(rejected.ready());
            assertEquals(429, rejected.lastStatus());
            assertTrue(coordinator.retryAfterSeconds(target) >= 59);
            for (int i = 0; i < 10; i++) {
                assertFalse(coordinator.wakeAsync(target, "next", "test").get(1, TimeUnit.SECONDS).ready());
            }
            assertEquals(1, calls.get());
        } finally { coordinator.shutdown(); server.stop(0); }
    }

    @Test
    void filterForwardsPostExactlyOnceAfterReadinessWithoutConsumingBody() throws Exception {
        var coordinator = new StubCoordinator(true);
        var filter = new DownstreamReadinessFilter(registry("http://localhost:8081"), coordinator);
        var request = new MockHttpServletRequest("POST", "/vault/auth/login");
        request.setContent("test-body".getBytes(StandardCharsets.UTF_8));
        var count = new AtomicInteger();
        filter.doFilter(request, new MockHttpServletResponse(), (req, res) -> {
            count.incrementAndGet();
            assertEquals("test-body", new String(req.getInputStream().readAllBytes(), StandardCharsets.UTF_8));
        });
        assertEquals(1, count.get());
        assertEquals(3, coordinator.wakes);
        coordinator.shutdown();
    }

    @Test
    void failedReadinessNeverForwardsLogin() throws Exception {
        var coordinator = new StubCoordinator(false);
        var response = new MockHttpServletResponse();
        new DownstreamReadinessFilter(registry("http://localhost:8081"), coordinator).doFilter(
                new MockHttpServletRequest("POST", "/vault/auth/login"), response,
                (req, res) -> fail("Login must not reach a sleeping dependency"));
        assertEquals(503, response.getStatus());
        assertEquals("false", response.getHeader("X-Guardian-Request-Forwarded"));
        assertTrue(response.getContentAsString().contains("SERVICE_THROTTLED"));
        coordinator.shutdown();
    }

    @Test
    void preflightDoesNotWakeServices() throws Exception {
        var coordinator = new StubCoordinator(true);
        var count = new AtomicInteger();
        new DownstreamReadinessFilter(registry("http://localhost:8081"), coordinator).doFilter(
                new MockHttpServletRequest("OPTIONS", "/vault/auth/login"), new MockHttpServletResponse(),
                (req, res) -> count.incrementAndGet());
        assertEquals(1, count.get());
        assertEquals(0, coordinator.wakes);
        coordinator.shutdown();
    }

    private static class StubCoordinator extends DownstreamWakeCoordinator {
        int wakes;
        private final boolean ready;
        StubCoordinator(boolean ready) {
            super(true, 60000, 10000, 1000, 1000, 250, 250);
            this.ready = ready;
        }
        @Override
        public java.util.concurrent.CompletableFuture<WakeResult> wakeAsync(
                DownstreamServiceRegistry.DownstreamService service, String id, String trigger) {
            wakes++;
            return java.util.concurrent.CompletableFuture.completedFuture(
                    new WakeResult(ready, ready ? 200 : 429, 1, 0, "test"));
        }
    }
}
