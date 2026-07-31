# Security Health Service

Phase 8 microservice for The Guardian.

## Current responsibility

This service preserves the security-health backend behavior that exists in the supplied monolith:

- Accept a completed client security-scan summary
- Validate that the authenticated account has breach-monitoring entitlement
- Publish a breached-password or security-scan notification

It does **not** invent a new breach provider or move password decryption out of Vault Service. The uploaded backend currently receives the scan result from the client rather than performing the scan itself.

## Public endpoint

```text
POST /vault/security-alerts/scan
```

## Port

`8088`

## Required services

- Auth Service: `8081`
- Notification Service: `8082`
- Subscription Service: `8083`

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
