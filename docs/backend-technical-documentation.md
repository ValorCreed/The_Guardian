# Backend Technical Documentation

## Overview

`backend/` is the server component of **The Guardian**, a secure digital vault. It is a stateless-ish
Express 4 + TypeScript API backed by PostgreSQL that the Expo client (`src/services/api.ts`) talks to.

Highlights:

- Full authentication lifecycle: email-code verification, password reset, session tokens, device limits,
  2FA, biometric hash binding, and a duress mode that downgrades session capabilities.
- CRUD for vault items (passwords, cards, notes), encrypted document storage, plan-gated features.
- Emergency access, family sharing, recovery kit / recovery circle, estate playbooks and continuity drills
  (FAMILY), and safety-check reminders.
- Device sessions, users, notifications, support/bug-reports, security alerts, subscriptions and payments
  (sandbox-first), and encrypted backup/restore.
- Migrations run automatically at boot; scheduled cron jobs (delayed duress alerts, safety-check grace,
  recovery expiry, session cleanup).

## Tech stack

- Node.js ≥ 20 · TypeScript 5.5 · Express 4 · PostgreSQL (`pg`) · zod · jsonwebtoken · bcryptjs
- `tsx` for dev/scripts, `vitest` + `supertest` for tests
- Optional integrations: nodemailer (SMTP), expo-server-sdk (push), Paystack SDK-style REST (payments)

## Project layout

```txt
backend/
├── src/
│   ├── config/env.ts         # zod-validated environment
│   ├── app.ts                # createApp(): middleware + routers + error handling
│   ├── index.ts              # boot(): migrate → cron → listen
│   ├── db/
│   │   ├── pool.ts           # pg Pool + query<T>/row<T>/rows<T> helpers
│   │   ├── migrate.ts        # idempotent runner for migrations below
│   │   ├── schema.ts         # SCHEMA_SQL, MIGRATION_002_SQL, clearVaultState()
│   │   └── seed.ts           # npm run seed:demo (demo users)
│   ├── middleware/
│   │   ├── auth.ts           # requireAuth (JWT + live session + duress mode)
│   │   ├── featureGate.ts    # requireFeature → 403 FORBIDDEN
│   │   └── rateLimit.ts      # reusable limiters
│   ├── lib/
│   │   ├── codes.ts, errors.ts, token.ts, crypto.ts (AES-256-GCM),
│   │   ├── plan.ts (PLAN_LIMITS), mailer.ts, emailTemplates.ts,
│   │   ├── pusher.ts (Expo), storage.ts (disk), testCodes.ts
│   ├── routes/               # 20 route modules (see app.ts mount table)
│   ├── services/notifications.ts
│   └── types/node-cron.d.ts  # local declarations for node-cron
├── tests/                    # vitest + supertest integration tests
├── vitest.config.ts
├── render.yaml               # Render blueprint (deploy)
└── Dockerfile
```

## Environment

All env vars are defined and validated in `src/config/env.ts`. See `backend/.env.example` for the full
list with comments. Essential secrets at minimum:

- `JWT_SECRET` (≥16 chars) — sign sessions.
- `VAULT_ENCRYPTION_KEY` (≥16, prefer 32) — AES-256-GCM at-rest encryption of vault payloads +
  document/backup blobs.
- `DATABASE_URL` — Postgres connection string. The pool uses SSL only when the URL requests it
  (`?ssl=true`), safe for Render-managed Postgres.
- `PAYMENTS_SANDBOX=true` — plan upgrades are granted instantly without charging.

Production guardrails: if `NODE_ENV=production` and either the JWT secret or encryption key is still the
`change-me-in-production` placeholder the server refuses to boot.

## Data model (summary)

All tables created idempotently in `src/db/schema.ts` (`SCHEMA_SQL`). Key tables:

- `users`, `subscriptions`, `sessions` (uuid id, `mode`, `ip_address`, `revoked_at/revoked_by`,
  `last_active_at`, `expires_at`), `password_reset_tokens`
- `vault_items` (`item_type`, open/encrypted payload columns, family sharing columns)
- `cards`, `notes`, `documents` + document storage sidecars, `vault_item_shares`
- `emergency_contacts`, `emergency_requests`
- `families`, `family_memberships`, `family_invites`, `vault_item_shares`
- `recovery_kits`, `recovery_circle_members`, `recovery_requests`
- `estate_playbooks`, `estate_executions`, `estate_contacts`
- `continuity_drills`, `continuity_responses`
- `safety_check_settings`, `safety_checks`
- `notifications`, `notification_preferences` (single-row JSONB per user),
  `push_tokens`, `security_alerts`, `bug_reports`
- `payment_orders` (reference, provider, status `INITIATED|PAID|FAILED`, amount), `deleted_accounts`
- `user_2fa`, `device_biometrics`, `legal_acceptances`, `duress_settings`
- `security_score_cache`, `app_config`

`MIGRATION_002_SQL` adds recovery columns to `users` and the `deleted_accounts` table. The migration
runner records filenames in `schema_migrations` and applies each SQL block exactly once.

`clearVaultState()` wipes a user's vault/backup/notification/session data in a single transaction and
records an archive row in `deleted_accounts` (used by DELETE /vault/users/me).

## Auth and sessions

`middleware/auth.ts`:

1. Reads `Authorization: Bearer`.
2. `verifyUserToken` → `{ sub, sid, mode }`.
3. Re-checks a live session row: exists, owned by user, `expires_at > now()`.
4. Touches `last_active_at` and sets `req.userId`, `req.sessionId`, `req.sessionMode`.

Duress mode: when a session was minted by duress login, route handlers degrade — vault list/read returns
`[]`, critical actions (family admin, delete, upgrade, consent, sessions) reject. `POST /vault/auth/duress`
flips the account into duress state so subsequent `login` calls are duress-minted; a companion
`/duress/preview` returns the same payload without side effects so the UI can show a decoy.

## Plan model

`lib/plan.ts`:

| Feature | FREE | PREMIUM | FAMILY |
|---|---|---|---|
| passwords / cards / notes | 10 / 3 / 5 | unlimited | unlimited |
| devices | 1 | 5 | 10 |
| document vault, backup, recovery kit, recovery circle, security scan, safety check | – | ✓ | ✓ |
| emergency contacts | 0 | ≤5 | ≤10 |
| family sharing, estate, continuity drills | – | – | ✓ |

Enforcement is server-side: `requireFeature` (403 `FORBIDDEN`) for feature gates and explicit count
checks returning `403 PLAN_LIMIT_REACHED`.

## Encryption

- `lib/crypto.ts`: AES-256-GCM. Ciphertext format `v1.<iv_b64>.<tag_b64>.<ct_b64>`.
- Vault field values: the client already encrypts/obfuscates payloads (client-side passthrough), and the
  gateway re-encrypts anything that should be opaque at rest. **This is not zero-knowledge** — the gateway
  can decrypt if given the key; document this limitation honestly.
- Documents: file blob AES-encrypted to disk with a `.iv` sidecar per file (`lib/storage.ts`).
- Backups: entire snapshot encrypted into a single `encryptedBackup` base64 blob + `checksum`.

## Cron jobs (`index.ts`)

- Every minute: duress delayed alerts (`pending_alert_count>0`, delay elapsed → notify contact & purge),
  safety checks `ACTIVE` → `GRACE` when `next_check_at` passed.
- Hourly: `recovery_requests` `PENDING` → `EXPIRED`.
- Daily 02:00: session cleanup (hard-delete expired/revoked sessions older than TTL).

Schedules use `node-cron` (`import { schedule }`). Local type declarations in `src/types/node-cron.d.ts`.

## Adapters

- **Mail** (`lib/mailer.ts`): SMTP via nodemailer; `canSendEmail()` no-ops when `SMTP_HOST` is unset.
- **Push** (`lib/pusher.ts`): Expo push using `expo-server-sdk` chunking (`checkReceipts` uses
  `chunkPushNotificationReceiptIds`); safe when `EXPO_ACCESS_TOKEN` is unset.
- **Payments** (`lib/payments.ts` + `routes/payments.ts`): Paystack-style `initialize`/`verify` contract.
  In sandbox (`PAYMENTS_SANDBOX=true`) `verify` grants the plan immediately without an external charge.
- **Storage** (`lib/storage.ts`): local-disk files under `STORAGE_DIR`. Swap for S3 in production if the
  instance disk is not durable.

## Rate limiting

`/vault` 1000 req/15 min; `/vault/auth` 60 req/15 min (skips successful requests). Responses use
`draft-7` standard headers.

## Run / Build / Test

```bash
npm install                          # once
cp .env.example .env                 # fill DATABASE_URL, JWT_SECRET, VAULT_ENCRYPTION_KEY
npm run db:migrate                   # apply schema
npm run seed:demo                    # optional demo users
npm run dev                          # tsx watch
npm run build && npm start           # compiled production start (dist/src/index.js)
npm run typecheck                    # tsc --noEmit
npm test                             # vitest; requires a test Postgres (TEST_DATABASE_URL or default)
```

Boot sequence (`index.ts`): run migrations → start cron → `app.listen`.

## Tests

`tests/api.test.ts` covers: health probe, 404 JSON, register + verify + usable token, wrong code /
duplicate email, login success/failure, FREE single-device limit + force-replace, session revocation,
vault CRUD + cross-user isolation + FREE 11th-password limit, plan gating (docs/emergency/backup/kit on
FREE), sandbox upgrade to PREMIUM, backup after upgrade, 2FA enable + login challenge, notification pref
round-trip, and session listing.

Run with `npm test`. The suite truncates all tables before each test and assumes a disposable database
(`postgres://guardian:guardian@localhost:5432/guardian_test` by default; override with
`TEST_DATABASE_URL`). Verification codes are read via `getTestCode()` (test modes only).

## Deployment

- **Render**: `render.yaml` blueprint → web service + managed Postgres. Env secrets are marked
  `generateValue`/`sync:false`. Health check `/actuator/health`. Render's Node builds use
  `npm ci && npm run build` then `npm start`.
- **Docker**: multi-stage `Dockerfile` (build → runtime with `--omit=dev`, STORAGE_DIR on `/data`).

After first deploy: set `API_BASE_URL`/`EXPO_PUBLIC_API_BASE_URL` on the client to the new URL and
`PAYMENTS_SANDBOX=false` + real `PAYSTACK_SECRET_KEY` once live.

## Security notes

- Server enforces plan limits & authorization; never trust the client.
- No plaintext secrets in logs: password hashes only, JWT/keys never logged, document/backup bodies
  not logged.
- Rate limits on auth routes; session rows checked each request; sessions revocable per-device.
- CORS is open by default (`ALLOWED_ORIGINS=*`); narrow it in production.
- `helmet` applied (CSP disabled for mobile API consumption), `x-powered-by` off.

## Known limitations

- Verification codes are 6-digit and emailed (or recorded in memory under `NODE_ENV=test`). For SMS/TOTP
  add a provider later.
- Backup/restore is currently JSON + AES blob on instance disk — large vaults should switch to a durable
  object store.
- Document encryption is application-level; document metadata counts are enforced, not content scanning.
- No rate limit yet on `biometric` or `2fa/verify` (covered by auth limiter when mounted under `/vault/auth`).
- Payment amounts are illustrative starter values in NGN.