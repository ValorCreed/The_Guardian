package com.vault.theguardian.migration;

import org.flywaydb.core.Flyway;
import org.flywaydb.core.api.MigrationInfo;
import org.flywaydb.core.api.MigrationInfoService;
import org.flywaydb.core.api.output.MigrateResult;

public final class DatabaseMigrationRunner {

    private static final String MIGRATION_LOCATION = "classpath:db/migration";

    private DatabaseMigrationRunner() {
    }

    public static void main(String[] args) {
        String databaseUrl = requireEnvironmentVariable("DATABASE_URL");
        String databaseUsername = requireEnvironmentVariable("DATABASE_USERNAME");
        String databasePassword = requireEnvironmentVariable("DATABASE_PASSWORD");

        try {
            Flyway flyway = Flyway.configure()
                    .dataSource(databaseUrl, databaseUsername, databasePassword)
                    .locations(MIGRATION_LOCATION)
                    .baselineOnMigrate(true)
                    .validateOnMigrate(true)
                    .load();

            System.out.println("=========================================");
            System.out.println("        THE GUARDIAN");
            System.out.println("    Database Migration Runner");
            System.out.println("=========================================");
            System.out.println("Validating Flyway migration history...");

            flyway.validate();
            MigrateResult result = flyway.migrate();
            MigrationInfoService info = flyway.info();
            MigrationInfo current = info.current();

            System.out.printf("Migrations executed: %d%n", result.migrationsExecuted);
            System.out.printf("Current schema version: %s%n",
                    current == null || current.getVersion() == null
                            ? "none"
                            : current.getVersion().getVersion());
            System.out.println("Database migration completed successfully.");
        } catch (Exception exception) {
            System.err.println("Database migration failed: " + exception.getMessage());
            exception.printStackTrace(System.err);
            System.exit(1);
        }
    }

    private static String requireEnvironmentVariable(String name) {
        String value = System.getenv(name);
        if (value == null || value.isBlank()) {
            throw new IllegalStateException("Missing required environment variable: " + name);
        }
        return value;
    }
}
