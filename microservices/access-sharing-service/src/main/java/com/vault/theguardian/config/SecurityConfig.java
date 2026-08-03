package com.vault.theguardian.config;

import com.vault.theguardian.auth.JwtAuthenticationFilter;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.UsernamePasswordAuthenticationFilter;

@Configuration
public class SecurityConfig {
    private final JwtAuthenticationFilter jwtAuthenticationFilter;

    public SecurityConfig(JwtAuthenticationFilter jwtAuthenticationFilter) {
        this.jwtAuthenticationFilter = jwtAuthenticationFilter;
    }

    @Bean
    public SecurityFilterChain securityFilterChain(HttpSecurity http) throws Exception {
        http
                .csrf(csrf -> csrf.disable())
                .sessionManagement(session ->
                        session.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
                .authorizeHttpRequests(auth -> auth
                        .requestMatchers("/", "/actuator/health", "/actuator/info", "/internal/family/**", "/internal/account/**", "/internal/emergency/**").permitAll()
                        .requestMatchers(
                                "/vault/family", "/vault/family/**",
                                "/vault/emergency", "/vault/emergency/**",
                                "/vault/safety-check", "/vault/safety-check/**",
                                "/vault/estate-playbooks", "/vault/estate-playbooks/**",
                                "/vault/continuity-drill", "/vault/continuity-drill/**"
                        ).authenticated()
                        .anyRequest().denyAll()
                )
                .addFilterBefore(jwtAuthenticationFilter, UsernamePasswordAuthenticationFilter.class);

        return http.build();
    }
}
