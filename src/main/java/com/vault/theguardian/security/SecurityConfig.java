package com.vault.theguardian.security;
import com.vault.theguardian.user.User;
import com.vault.theguardian.user.UserRepository;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Bean;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.web.filter.OncePerRequestFilter;

import jakarta.servlet.FilterChain;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

import java.util.Optional;


//THis protects every endpoint except login and register
@Configuration
public class SecurityConfig {
    private final JwtService jwtService;
    private final UserRepository userRepository;

    public SecurityConfig(JwtService jwtService, UserRepository userRepository) {
        this.jwtService = jwtService;
        this.userRepository = userRepository;
    }
    @Bean
    public SecurityFilterChain securityFilterChain(HttpSecurity http) throws Exception {
        http
                .csrf(csrf -> csrf.disable())
                        .sessionManagement(sessionManagement ->
                                sessionManagement.sessionCreationPolicy(SessionCreationPolicy.STATELESS)
                        )
                        .authorizeHttpRequests(auth->auth
                                .requestMatchers("/","/vault/auth/login"
                                        ,"/vault/auth/register",
                                        "/vault/auth/forgot-password",
                                        "/vault/auth/reset-password",
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
    public OncePerRequestFilter jwtFilter(

    ) {
        return new OncePerRequestFilter() {
            @Override
            protected void doFilterInternal(
                    HttpServletRequest request,
                    HttpServletResponse response,
                    FilterChain filterChain
            ) {
                try {
                    String path = request.getServletPath();

                    if (
                            path.equals("/")
                                    || path.equals("/vault/auth/login")
                                    || path.equals("/vault/auth/register")
                                    ||path.equals("/vault/auth/forgot-password")
                                    ||path.equals("/vault/auth/reset-password")
                                    ||path.equals("/vault/payments/callback")
                    ) {
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

                    User user = userRepository.findByEmail(email)
                            .orElseThrow(() -> new RuntimeException("User not found"));

                    UsernamePasswordAuthenticationToken authentication =
                            new UsernamePasswordAuthenticationToken(
                                    user,
                                    null,
                                    java.util.List.of()
                            );

                    SecurityContextHolder.getContext().setAuthentication(authentication);

                    filterChain.doFilter(request, response);

                } catch (Exception e) {
                    response.setStatus(HttpServletResponse.SC_UNAUTHORIZED);
                }
            }
        };
    }
}
