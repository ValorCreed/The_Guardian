package com.vault.theguardian.emailservice.config;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.UsernamePasswordAuthenticationFilter;

@Configuration
public class SecurityConfig {
    private final InternalServiceKeyFilter internalServiceKeyFilter;

    public SecurityConfig(InternalServiceKeyFilter internalServiceKeyFilter) {
        this.internalServiceKeyFilter = internalServiceKeyFilter;
    }

    @Bean
    public SecurityFilterChain securityFilterChain(HttpSecurity http) throws Exception {
        http
                .csrf(csrf -> csrf.disable())
                .sessionManagement(session ->
                        session.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
                .authorizeHttpRequests(auth -> auth
                        .requestMatchers("/", "/actuator/health", "/actuator/info").permitAll()
                        .requestMatchers("/internal/emails", "/internal/emails/**").permitAll()
                        .anyRequest().denyAll()
                )
                .addFilterBefore(
                        internalServiceKeyFilter,
                        UsernamePasswordAuthenticationFilter.class
                );

        return http.build();
    }
}
