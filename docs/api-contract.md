# API Contract — The Guardian Backend vs the Android App

Status: **LIVE CONTRACT VERIFIED** — 80/80 request/response checks pass against the running
`:4000` backend using only HTTP (no in-process code), driven by the app's own DTOs in
`The_Guardian/src/services/api.ts`.

## How verification works

`backend/tests/live-contract.mjs` is a standalone Node script (no test framework) that:

1. Starts from a fresh database (recommended: `guardian_test`).
2. Registers Alice (FREE), Bob, Carol via the real email-code flow.
3. Drives an end-to-end scenario through every area of the product over plain HTTP:
   register → verify → login → consent → devices → profile → passwords/cards/documents/notes →
   backup → continuity → emergency → family → recovery circle (incl. full recovery) →
   duress + biometrics → safety check → incidents → recovery kit → estate playbooks →
   plan limits → notifications → password reset.
4. Asserts HTTP status codes AND exact Dart DTO field names/shapes from `api.ts`.

Run it:

```
cd backend
node tests/live-contract.mjs        # needs the dev server running on :4000
```

It is not part of `npm test`; it targets the running server and uses `NODE_ENV=test`
harness helpers (e.g. `GET /vault/auth/_test/codes/:email`).

## Areas covered (contract groups)

| Group | Endpoint family | Last status |
|-------|-----------------|-------------|
| A | `/vault/auth/register|verify-registration|login` | PASS |
| B | `/vault/sessions`, `/vault/users/me/profile` | PASS |
| C | `/vault/payments/initialize|verify` | PASS |
| D | `/api/vault` (items), `/vault/notes`, `/vault/documents` | PASS |
| E | `/vault/backup` | PASS |
| F | `/vault/emergency/*` (request/vault/audit) | PASS |
| G | `/vault/family/*` (overview/members/shared-items) | PASS |
| H | `/vault/recovery-circle/*` incl. `/recovery/start|status|complete` | PASS |
| I | `/vault/auth/duress`, `/duress/preview`, `/biometric/enroll|login` | PASS |
| J | `/vault/safety-check/*` | PASS |
| K | `/vault/incidents/*` | PASS |
| L | `/vault/estate-playbooks/*` incl. executions | PASS |
| M | `/vault/continuity-drill/*` | PASS |
| N | `/vault/recovery-kit/*`, `/vault/auth/forgot-password|reset-password` | PASS |
| O | Plan limits (FREE item caps, device limits) | PASS |
| P | `/vault/notifications/*` | PASS |
| Q | Password reset flow | PASS |

## Contract details locked in (from `api.ts`)

- **Auth**: register sends `{ fullname, email, password }` (lowercase `fullname`). Register
  → `201`. Verify-registration and biometric/login and payment initialize → `201`; login,
  forgot/reset password → `200`.
- **Device ids**: `X-Guardian-Device-Id` must be a UUID string (sessions table stores it as
  text). FREE allows 1 active device; `forceReplaceDevice: true` replaces the oldest.
- **Profile update**: `PUT /vault/users/me/profile { fullName }`.
- **Push token**: `PUT /vault/notifications/push-token
  { installationId, expoPushToken, platform, deviceName, appVersion }` → `{ registered: true }`.
- **Duress `DuressSettingsResponse`**: `plan, eligible, canConfigure, enabled, alertEnabled,
  alertContactUserId?, alertContactEmail?, alertContactName?, alertDelayMinutes,
  pendingAlertCount, updatedAt?, message, contacts[]`. `contacts` are emergency contacts with
  the registered user's `userId` (joined by email), also returned BEFORE duress is configured
  so the setup screen can pick an alert contact.
- **Family `FamilyOverview`**: uses `familyPlan` (no `plan`). Member POST returns
  `membershipId` (not `id`); `FamilyMemberAccess` has `passwordItemIds` (no `sharePasswords`).
- **Recovery circle**: PUT config returns plaintext `recoveryCode`; `recovery/start` → `201`
  `{ requestId, ... }`; `recovery/complete { requestId, recoveryCode, newPassword }` resets the
  owner password and returns `{ message }`.
- **Recovery kit status**: `{ created, recoveryId, createdAt, lastUsedAt }` (no `active`);
  `recovery-kit/generate` → `201` `{ recoveryId, recoveryKey }`.
- **Continuity `ContinuityOverview`**: `activeDrill / history / receivedRequests` (no
  `recentDrills`). Acknowledge uses the response `publicId` (CDR-...) from `receivedRequests`.
- **Estate**: playbook create → `201`; `triggerType` is one of
  `OWNER_RELEASE | EMERGENCY_APPROVAL | SAFETY_CHECK`; `/:id/release` → `201` and creates the
  execution with `recipient_user_id` resolved from the playbook's recipient contact; released
  item read and execution complete are only allowed for the recipient account.
- **Incidents**: `incidents/rotate` and `cancel` return `status`; audit uses actorEmail.
- **2FA/biometric enroll**: `POST /vault/auth/biometric/enroll` → `201 { credentialToken, expiresAt }`.

## Simplification notes for review

- Push notifications are stub/sandbox (EXPO_ACCESS_TOKEN empty locally).
- Payments run in sandbox; `payments/verify` flips the plan immediately.
- Test-only harness endpoints live behind `NODE_ENV === 'test'` and can never run in prod.
- Rate limiters (`authLimiter`, `codeLimiter`) skip enforcement under `NODE_ENV === 'test'`
  (`globalLimiter` already did).

## Related files

- Contract source of truth: `The_Guardian/src/services/api.ts`
- Harness: `backend/tests/live-contract.mjs`
- Vitest suite: `backend/tests/api.test.ts` + `helpers.ts`