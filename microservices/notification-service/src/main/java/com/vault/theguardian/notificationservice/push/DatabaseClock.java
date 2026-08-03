package com.vault.theguardian.notificationservice.push;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

import java.time.LocalDateTime;

@Component
public class DatabaseClock {
    private final JdbcTemplate jdbcTemplate;

    public DatabaseClock(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
    }

    public LocalDateTime now() {
        LocalDateTime value = jdbcTemplate.queryForObject(
                "select (current_timestamp at time zone 'UTC')",
                LocalDateTime.class
        );
        if (value == null) {
            throw new IllegalStateException("Database time could not be resolved.");
        }
        return value;
    }
}
