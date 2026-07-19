# User Account Service

Phase 7 microservice for **The Guardian**.

## Port

`8087`

## Current public responsibility

The monolith currently exposes one user-account endpoint, so this service intentionally extracts only that existing behaviour:

```http
DELETE /vault/users/me
```

It does not invent profile-update routes that were not present in the supplied monolith.

## Account-deletion workflow

1. Auth Service validates the bearer session.
2. Auth Service verifies the submitted password.
3. Vault Service removes passwords, cards, documents, notes, and B2 objects.
4. Access Sharing Service removes family and emergency-access data.
5. Backup & Recovery Service removes recovery kits.
6. Subscription Service removes subscriptions and payments.
7. Notification Service removes notifications.
8. Auth Service deletes the user record and any remaining cascading rows.

The operations are idempotent. Auth deletion is deliberately last so a temporary downstream failure does not remove the login account before cleanup completes.

## Run

```powershell
.\mvnw.cmd clean test
.\mvnw.cmd spring-boot:run
```

Health endpoint:

```http
GET http://localhost:8087/actuator/health
```
