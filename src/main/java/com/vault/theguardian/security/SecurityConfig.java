package com.vault.theguardian.security;

import com.vault.theguardian.session.UserSession;
import com.vault.theguardian.session.UserSessionRepository;
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

import java.time.LocalDateTime;

@Configuration
public class SecurityConfig {
    private final JwtService jwtService;
    private final UserRepository userRepository;
    private final UserSessionRepository userSessionRepository;

    public SecurityConfig(
            JwtService jwtService,
            UserRepository userRepository,
            UserSessionRepository userSessionRepository
    ) {
        this.jwtService = jwtService;
        this.userRepository = userRepository;
        this.userSessionRepository = userSessionRepository;
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
                                "/vault/recovery-kit/reset-password",
                                "/vault/recovery-kit/reset-account",
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

                    String email = jwtService.extractEmail(token);
                    String tokenId = jwtService.extractTokenId(token);

                    if (tokenId == null || tokenId.isBlank()) {
                        response.setStatus(HttpServletResponse.SC_UNAUTHORIZED);
                        return;
                    }

                    UserSession session = userSessionRepository.findByTokenIdAndActiveTrue(tokenId)
                            .orElse(null);

                    if (session == null || session.getUser() == null) {
                        response.setStatus(HttpServletResponse.SC_UNAUTHORIZED);
                        return;
                    }

                    User user = session.getUser();

                    /*
                     * Extra safety check:
                     * The JWT subject must match the session owner.
                     */
                    if (!user.getEmail().equalsIgnoreCase(email)) {
                        response.setStatus(HttpServletResponse.SC_UNAUTHORIZED);
                        return;
                    }

                    touchSessionIfNeeded(session);

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
                || path.equals("/vault/recovery-kit/reset-password")
                || path.equals("/vault/recovery-kit/reset-account")
                || path.equals("/vault/payments/callback");
    }

    private void touchSessionIfNeeded(UserSession session) {
        LocalDateTime now = LocalDateTime.now();

        if (
                session.getLastSeenAt() == null ||
                        session.getLastSeenAt().isBefore(now.minusMinutes(1))
        ) {
            session.setLastSeenAt(now);
            userSessionRepository.save(session);
        }
    }
}
