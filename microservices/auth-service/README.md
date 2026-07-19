# The Guardian Auth Service — Phase 1

This is the first extracted service from the original monolithic backend.

## Owns in Phase 1

- Registration and login
- Email verification
- Password reset codes
- Two-factor authentication
- JWT generation and validation
- Trusted device sessions

## Temporary migration dependencies

To keep registration and login working while the other services are still being extracted, this phase temporarily includes:

- Subscription entity/repository (for plan lookup and device limits)
- Notification persistence used by welcome/device alerts
- Gmail email sender

These will later be replaced by calls/events to `subscription-service` and `notification-service`.

## Database strategy

Phase 1 uses the same existing database tables as the monolith. Flyway is disabled here so only the original backend owns migrations during this transition.

## Local port

- Auth Service: `8081`
- API Gateway: `8080`
- Existing monolith: `8089` (or your chosen legacy port)

## Run

Set the same database, JWT, and Gmail environment variables as the original backend, then run:

```powershell
.\mvnw.cmd spring-boot:run
```

If Maven wrapper files are not present, use:

```powershell
mvn spring-boot:run
```
