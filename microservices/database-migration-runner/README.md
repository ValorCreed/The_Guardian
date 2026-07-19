# The Guardian Database Migration Runner

This project is the single Flyway owner for The Guardian's shared PostgreSQL schema.
It has no HTTP server and exits after validating and applying pending migrations.

## Required environment variables

- `DATABASE_URL`
- `DATABASE_USERNAME`
- `DATABASE_PASSWORD`

## Run on Windows

```powershell
$env:DATABASE_URL="jdbc:postgresql://..."
$env:DATABASE_USERNAME="..."
$env:DATABASE_PASSWORD="..."
.\mvnw.cmd clean compile exec:java
```

A fully migrated database should report `Migrations executed: 0` and current schema version `20`.

## Adding a future migration

Add one new immutable SQL file under `src/main/resources/db/migration`, for example:

```text
V21__describe_the_change.sql
```

Never edit a migration that has already been applied.
