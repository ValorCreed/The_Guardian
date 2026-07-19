# Backup and Recovery Service

Phase 6 microservice for The Guardian.

## Responsibilities

- Encrypted `.tgvault` backup creation
- Backup status and entitlement checks
- Password, card, and document restoration
- Recovery-kit generation, status, revocation, and use
- Account reset with permanent vault erasure

## Port

`8086`

## Required services

- Auth Service: `8081`
- Notification Service: `8082`
- Subscription Service: `8083`
- Vault Service: `8084`
- Access Sharing Service: `8085`

## Run

Windows:

```powershell
.\mvnw.cmd clean test
.\mvnw.cmd spring-boot:run
```

Linux/macOS:

```bash
./mvnw clean test
./mvnw spring-boot:run
```

Only the monolith currently runs Flyway. This service validates the existing shared schema and does not create tables.
