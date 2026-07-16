# The Guardian Backend

The Guardian backend is a Java/Spring Boot REST API for a secure digital vault mobile application. It powers authentication, JWT sessions, encrypted vault records, document storage, subscriptions, Paystack payments, family sharing, emergency access, recovery kits, notifications, backups, and bug reporting.

## Tech Stack

```txt
Java 26
Spring Boot 4.1.0
Spring Security
Spring Data JPA / Hibernate
PostgreSQL
Flyway
JWT / JJWT
BCrypt
Gmail API
Paystack
Backblaze B2 / S3-compatible storage
Docker
```

## Main Features

```txt
User registration and login
Email verification
Two-factor authentication
Password reset
JWT authentication
Device session management
Encrypted password vault
Encrypted card vault
Encrypted document upload/download
Encrypted secure notes
Subscription plans: Free, Premium, Family
Paystack payment verification
Family sharing
Emergency access and audit logs
Recovery kit account recovery
Encrypted backup and restore
In-app notifications
Bug reporting with admin email notification
```

## Project Structure

The uploaded documentation files are flattened, but the code is organized by Java packages such as:

```txt
com.vault.theguardian.auth
com.vault.theguardian.security
com.vault.theguardian.user
com.vault.theguardian.vault
com.vault.theguardian.cards
com.vault.theguardian.documents
com.vault.theguardian.notes
com.vault.theguardian.subscription
com.vault.theguardian.payment
com.vault.theguardian.family
com.vault.theguardian.emergency
com.vault.theguardian.recovery
com.vault.theguardian.backup
com.vault.theguardian.notification
com.vault.theguardian.session
com.vault.theguardian.support
```

## Environment Variables

Set these in local environment or Render:

```txt
DATABASE_URL
DATABASE_USERNAME
DATABASE_PASSWORD
JWT_SECRET
JWT_EXPIRATION
VAULT_PASSWORD_SECRET
VAULT_DOCUMENT_SECRET
BACKUP_SECRET
GMAIL_CLIENT_ID
GMAIL_CLIENT_SECRET
GMAIL_REFRESH_TOKEN
GMAIL_FROM
DEMO_MODE
B2_ENABLED
B2_ENDPOINT
B2_REGION
B2_BUCKET
B2_KEY_ID
B2_APPLICATION_KEY
ADMIN_SUPPORT_EMAIL
PORT
```

Paystack service also expects:

```txt
paystack.secret.key
paystack.callback.url
```

Do not commit real secrets.

## Running Locally

```bash
mvn clean install
mvn spring-boot:run
```

Default local URL:

```txt
http://localhost:8080
```

For a physical phone running the Expo app, use the laptop LAN IP instead of `localhost`.

## Important Endpoints

```txt
POST /vault/auth/register
POST /vault/auth/login
GET  /vault/api/subscriptions/me
POST /api/vault
GET  /api/vault
POST /vault/cards
GET  /vault/cards
POST /vault/documents/upload
GET  /vault/documents/{id}/download
POST /vault/notes
GET  /vault/family
GET  /vault/emergency/overview
POST /vault/payments/initialize
POST /vault/payments/verify
POST /vault/support/bug-reports
```

Most endpoints require:

```http
Authorization: Bearer <token>
```

## Documentation

Full backend documentation is available here:

```txt
docs/backend-technical-documentation.md
docs/backend-api-reference.md
```

## Deployment

The backend includes a Dockerfile that builds with Java 26 and Maven, then runs the compiled JAR with Eclipse Temurin JRE.

Render-compatible runtime config:

```properties
server.address=0.0.0.0
server.port=${PORT:8080}
```

## Security Notes

```txt
Passwords are BCrypt hashed.
Vault/card/note values are encrypted before storage.
Document files are encrypted before storage.
B2 bucket should stay private.
Recovery keys are hashed, not stored in plaintext.
JWT and encryption secrets must be strong and private.
```

## Current Latest Migration

```txt
V20__create_bug_reports.sql
```

## Recommended Next Improvements

```txt
Add Swagger/OpenAPI docs.
Add rate limiting for auth and recovery endpoints.
Add automated tests.
Add admin bug report dashboard.
Add backend card-count plan limits if required.
Add audit logs for sensitive read/download events.
```