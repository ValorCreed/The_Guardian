package com.vault.theguardian.backuprecovery.config;

import com.vault.theguardian.backuprecovery.auth.JwtAuthenticationFilter;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
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
                        .requestMatchers(
                                "/",
                                "/actuator/health",
                                "/actuator/info",
                                "/vault/recovery-kit/reset-password",
                                "/vault/recovery-kit/reset-account",
                                "/vault/recovery-circle/recovery/start",
                                "/vault/recovery-circle/recovery/status",
                                "/vault/recovery-circle/recovery/complete",
                                "/internal/account/**",
                                "/internal/continuity/**"
                        ).permitAll()
                        .requestMatchers(
                                "/vault/backup",
                                "/vault/backup/**",
                                "/vault/recovery-kit",
                                "/vault/recovery-kit/**",
                                "/vault/recovery-circle",
                                "/vault/recovery-circle/**"
                        ).authenticated()
                        .anyRequest().denyAll()
                )
                .addFilterBefore(jwtAuthenticationFilter, UsernamePasswordAuthenticationFilter.class);

        return http.build();
    }

    @Bean
    public PasswordEncoder passwordEncoder() {
        return new BCryptPasswordEncoder(12);
    }
}
