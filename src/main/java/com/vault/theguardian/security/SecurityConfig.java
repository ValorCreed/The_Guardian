package com.vault.theguardian.security;

import com.vault.theguardian.user.User;
import com.vault.theguardian.user.UserRepository;
import jakarta.servlet.FilterChain;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.web.filter.OncePerRequestFilter;

import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

@Configuration
public class SecurityConfig {
    private final JwtService jwtService;
    private final UserRepository userRepository;

    private final Map<String, CachedUser> userCache = new ConcurrentHashMap<>();
    private static final long USER_CACHE_MS = 5 * 60 * 1000;

    public SecurityConfig(JwtService jwtService, UserRepository userRepository) {
        this.jwtService = jwtService;
        this.userRepository = userRepository;
    }

    @Bean
    public SecurityFilterChain securityFilterChain(HttpSecurity http) throws Exception {
        http
                .csrf(csrf -> csrf.disable())
                .sessionManagement(session -> session.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
                .authorizeHttpRequests(auth -> auth
                        .requestMatchers(
                                "/",
                                "/vault/auth/login",
                                "/vault/auth/register",
                                "/vault/auth/logout",
                                "/vault/auth/verify-email",
                                "/vault/auth/resend-verification",
                                "/vault/auth/forgot-password",
                                "/vault/auth/reset-password",
                                "/vault/auth/verify-2fa",
                                "/vault/payments/callback"
                        ).permitAll()
                        .anyRequest().authenticated()
                )
                .addFilterBefore(jwtFilter(), org.springframework.security.web.authentication.UsernamePasswordAuthenticationFilter.class);

        return http.build();
    }

    @Bean
    public PasswordEncoder passwordEncoder() {
        return new BCryptPasswordEncoder(12);
    }

    @Bean
    public OncePerRequestFilter jwtFilter() {
        return new OncePerRequestFilter() {
            @Override
            protected void doFilterInternal(
                    HttpServletRequest request,
                    HttpServletResponse response,
                    FilterChain filterChain
            ) {
                try {
                    String path = request.getServletPath();

                    if (isPublicPath(path)) {
                        filterChain.doFilter(request, response);
                        return;
                    }

                    String authHeader = request.getHeader("Authorization");

                    if (authHeader == null || !authHeader.startsWith("Bearer ")) {
                        response.setStatus(HttpServletResponse.SC_UNAUTHORIZED);
                        return;
                    }

                    String token = authHeader.substring(7);

                    if (!jwtService.isTokenValid(token)) {
                        response.setStatus(HttpServletResponse.SC_UNAUTHORIZED);
                        return;
                    }

                    User user = getCachedUser(token);

                    UsernamePasswordAuthenticationToken authentication =
                            new UsernamePasswordAuthenticationToken(user, null, java.util.List.of());

                    SecurityContextHolder.getContext().setAuthentication(authentication);
                    filterChain.doFilter(request, response);

                } catch (Exception e) {
                    response.setStatus(HttpServletResponse.SC_UNAUTHORIZED);
                }
            }
        };
    }

    private boolean isPublicPath(String path) {
        return path.equals("/")
                || path.equals("/vault/auth/login")
                || path.equals("/vault/auth/register")
                || path.equals("/vault/auth/logout")
                || path.equals("/vault/auth/verify-email")
                || path.equals("/vault/auth/resend-verification")
                || path.equals("/vault/auth/forgot-password")
                || path.equals("/vault/auth/reset-password")
                || path.equals("/vault/auth/verify-2fa")
                || path.equals("/vault/payments/callback");
    }

    private User getCachedUser(String token) {
        long now = System.currentTimeMillis();
        CachedUser cached = userCache.get(token);

        if (cached != null && now < cached.expiresAt) {
            return cached.user;
        }

        String email = jwtService.extractEmail(token);
        User user = userRepository.findByEmail(email)
                .orElseThrow(() -> new RuntimeException("User not found"));

        userCache.put(token, new CachedUser(user, now + USER_CACHE_MS));
        return user;
    }

    private record CachedUser(User user, long expiresAt) {}
}
