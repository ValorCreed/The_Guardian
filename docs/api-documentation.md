# The Guardian Vault Gateway — API Reference

Base URL: `https://guardian-vault-gateway.onrender.com` (overridable on the client via `EXPO_PUBLIC_API_BASE_URL`).

Authentication: `Authorization: Bearer <token>`. Every authenticated endpoint takes device headers
`X-Guardian-Device-Id`, `X-Guardian-Device-Name`, `X-Guardian-Device-Type` (each ≤120 chars).

Errors: JSON `{ "error": string, "code": string, "data"?: unknown }` with appropriate HTTP status.
Common codes: `BAD_REQUEST`, `UNAUTHORIZED`, `FORBIDDEN`, `NOT_FOUND`, `CONFLICT`, `PLAN_LIMIT_REACHED`,
`RATE_LIMITED`, `DEVICE_LIMIT_REACHED`, `DURESS_MODE`, `PAYMENT_REQUIRED`, `VALIDATION_ERROR`.

---

## Health and infrastructure

| Method | Path | Description |
|---|---|---|
| GET | `/actuator/health?guardianProbe=<ts>` | Liveness probe. Returns `{ status: "UP", service, timestamp }`. |

## Auth — mount `/vault/auth`

| Method | Path | Description |
|---|---|---|
| POST | `/register` | `{ email, password, fullName }` → 201. Sends email verification code (in test mode the code is retrievable via `getTestCode`). |
| POST | `/verify-registration` | `{ email, code }` → 201 `LoginResponse` (token + user + plan + settings). |
| POST | `/resend-code` | `{ email }` → 200. |
| POST | `/login` | `{ email, password, forceReplaceDevice? }` → 200 `LoginResponse`. Returns `requiresTwoFactor` when 2FA is on. |
| POST | `/verify-2fa` | `{ email, code }` → 200 `LoginResponse`. |
| POST | `/forgot-password` | `{ email }` → 200 (email code). |
| POST | `/reset-password` | `{ email, code, newPassword }` → 200. |
| PUT | `/duress` | `{ enabled }` → toggles duress mode. Duress login creates an ACTIVE incident and schedules a delayed alert. |
| POST | `/duress/preview` | `{ email, password }` → DURESS-mode `LoginResponse` characterization WITHOUT creating an incident/session side effects. |
| PUT | `/2fa` | `{ enabled }` → toggles TOTP/backup-code two-factor. |
| PUT | `/2fa/verify` | `{ code }` → confirms enabling. |
| POST | `/biometric/enroll` | `{ hash, expiresInDays?=30 }` → registers a device biometric hash. |
| DELETE | `/biometric` | Removes biometric binding. |
| POST | `/consent` | `{ acceptedLegalVersion }` → records legal acceptance. |
| PUT | `/change-password` | `{ currentPassword, newPassword }` (authed) → old sessions stay, session re-issued. |

Duress behaviour: when a session token was minted in duress mode the middleware downgrades vault reads
to `[]` and marked endpoints to 403, so a compromised user can't clear their vault while still appearing
healthy to the attacker.

## Vault — mount `/api/vault` (items)

| Method | Path | Description |
|---|---|---|
| GET | `/api/vault` | List items. Query: `?itemType=&familyId=&sharedWithMe=`. DURESS → `[]`. |
| POST | `/api/vault` | Create `{ itemType, title, ...encrypted payload fields }` → 201. Plan-limited (FREE 10 pw / 3 cards / 5 notes). |
| GET | `/api/vault/:id` | Read one item (decrypted passthrough). DURESS → `[]`/empty. |
| PUT | `/api/vault/:id` | Update fields. |
| DELETE | `/api/vault/:id` | Delete → 204. |

Item types: `PASSWORD`, `CARD`, `DOCUMENT`, `NOTE`. The server treats the `encrypted*`/`.encrypted`-style
fields as opaque payload passthrough — the client already encrypts before sending; the gateway additionally
encrypts at rest.

Cards: mount `/vault/cards` — `GET /vault/cards` / `GET /vault/cards/:id` / `POST /vault/cards`
(DURESS-mode creates a decoy response), `PUT /vault/cards/:id`, `DELETE /vault/cards/:id`.
Notes: mount `/vault/notes` — `GET/POST /vault/notes`, `GET/PUT/DELETE /vault/notes/:id`.
Documents: mount `/vault/documents`:
  - `POST /vault/documents` create metadata (PREMIUM+),
  - `POST /vault/documents/upload` multipart `file` (10 MB express cap, `MAX_DOCUMENT_BYTES`),
  - `GET /vault/documents/:id/download` binary, `DELETE /vault/documents/:id`.
  Documents are stored encrypted on disk and served with `Content-Disposition: attachment`.

## Emergency access — mount `/vault/emergency`

| Method | Path | Description |
|---|---|---|
| GET | `/overview` | Summary (PREMIUM+, else 403). |
| GET | `/contacts` | Trusted contacts list. |
| POST | `/contacts` | Add contact (limit: FREE 0 / PREMIUM 5 / FAMILY 10). |
| PUT | `/contacts/:id` | `{ canViewVault, ... }`. |
| DELETE | `/contacts/:id` | Remove. |
| GET | `/requests` | Incoming/outgoing emergency requests. |
| POST | `/requests/send` | `{ contactEmailOrId }` → creates PENDING request. |
| POST | `/requests/:id/approve` / `deny` | Decide. |
| GET | `/access` | Current emergency access window. |
| POST | `/access/revoke` | Revoke emergency access. |

## Family — mount `/vault/family`

| Method | Path | Description |
|---|---|---|
| GET | `/members` | (FAMILY+) family members. |
| POST | `/members/lookup` | `{ email }` → find a FAMILY user to invite (returns limited profile or 404). |
| POST | `/members` | `{ email }` → send invite. |
| POST | `/invites/:id/accept` | Accept (DURESS-blocked). |
| POST | `/invites/:id/decline` | `{ reason? }`. |
| DELETE | `/members/:id` | Remove member. |
| PUT | `/members/:id/permissions/{vault,estate,drills}` | Toggle share type. |
| GET | `/shared` | Items shared with me. |
| POST | `/shared/:id` | `{ permission, familyMemberId }` → share a vault item. |
| PUT | `/shared/:itemId` | Update share permission. |
| DELETE | `/shared/:itemId` | Stop sharing. |

## Recovery kit — mount `/vault/recovery-kit`

| Method | Path | Description |
|---|---|---|
| POST | `/generate` | (PREMIUM+) generate recovery kit (encrypted, returned once). |
| GET | `/` | Status. |
| DELETE | `/` | Revoke kit. |
| POST | `/recover` | Verify recovery phrases/shares → returns a weak JWT + reset form flow. |
| POST | `/redeem` | `{ code/payload }` → complete recovery. |

## Recovery circle — mount `/vault/recovery-circle`

| Method | Path | Description |
|---|---|---|
| GET | `/members` | (PREMIUM+) your circle members. |
| POST | `/members` | `{ email, phrase? }`. |
| DELETE | `/members/:id` | Remove. |
| POST | `/members/:id/phrase` | `{ phrase, contactEmail }` → split phrase with member. |
| POST | `/start` | Unauthenticated: `{ memberEmail }` → begin recovery request using the contact's server-stored share. |
| POST | `/requests/:publicId/decide` | `{ approve|decline, memberKey? }`. |
| GET | `/requests/:publicId` | Status lookup. |

## Estate playbooks — mount `/vault/estate-playbooks`

| Method | Path | Description |
|---|---|---|
| GET | `/overview` | (FAMILY+) overview with contacts map. |
| GET | `/contacts` | Estate approvers/recipients. |
| POST | `/contacts` | Add recipient with role. |
| PUT | `/contacts/:id` | Update role/permission. |
| DELETE | `/contacts/:id` | Remove. |
| GET | `/` | Playbook list. |
| POST | `/` | Create `{ name, itemType(PASSWORD\|CARD\|DOCUMENT\|NOTE), itemId?, triggerType(INACTIVITY\|KEY_HOLDER_LOSS\|QUORUM_EXECUTION), triggerDelayDays, approvalMode(BASIC\|QUORUM\|TIMED), threshold?, instructions? }`. |
| GET | `/:id` | Detail (owner or member). |
| PUT | `/:id` | `{ status }`. |
| DELETE | `/:id` | 204. |
| GET | `/executions` | My executions. |
| POST | `/executions` | Start/trigger an execution. |
| GET | `/executions/:id/item` | Recipient-only metadata view (marks viewed). |
| GET | `/executions/:id/document` | Recipient-only decrypted document download. |
| POST | `/executions/:id/complete` | Recipient completes execution (retrieval done). |
| POST | `/:id/cancel` | Owner cancels. |

## Continuity drills — mount `/vault/continuity-drill`

| Method | Path | Description |
|---|---|---|
| GET | `/checks` | Score checks + `canComplete` (participantCount > 0 and all acknowledged). |
| GET | `/drills` | (FAMILY+) drill list. |
| POST | `/drills` | `{ name, description?, taskCount, approvalMode? }`. |
| POST | `/drills/:publicId/start` | Begin drill. |
| GET | `/drills/:publicId` | Detail. |
| POST | `/drills/:publicId/complete` | Finish. |
| GET | `/responses` | Drill responses. |
| POST | `/responses` | `{ drillPublicId, message? }` (participant). |
| POST | `/responses/:recordPublicId/acknowledge` | Unauthenticated via public id. |

## Safety check — mount `/vault/safety-check`

| Method | Path | Description |
|---|---|---|
| POST | `/` | `{ checkInEnabled, intervalDays, gracePeriodHours, contactId, threshold? }` → save settings + active check. |
| GET | `/status` | Current settings + latest check status. |
| POST | `/check-in` | Resets the active window (`next_check_at = now()+interval`, `status=ACTIVE`). |

Safety check machine states: `ACTIVE → GRACE` (missed window, cron +96h?) → `ESCALATED`. Participant
acknowledgement closes the loop.

## Sessions — mount `/vault/sessions`

| Method | Path | Description |
|---|---|---|
| GET | `/` | `DeviceSession[]` including `current` flag. |
| GET | `/heartbeat` | `{ active: boolean }` (duress-free token extension). |
| DELETE | `/:id` | Revoke specific session (or current). |
| POST | `/logout-others` | Revoke all but current. |
| POST | `/logout-all` | Revoke everything. |

## Users — mount `/vault/users`

| Method | Path | Description |
|---|---|---|
| GET | `/me` | `{ userId, fullName, email }`. |
| PUT | `/me/profile` | `{ fullName }`. |
| DELETE | `/me` | `{ password }` → verify password, `clearVaultState`, archive into `deleted_accounts`, delete row. |

## Notifications — mount `/vault/notifications`

| Method | Path | Description |
|---|---|---|
| GET | `/` | `AppNotification[]` (`body←message`, `route←actionRoute`). |
| GET | `/unread-count` | `{ count }`. |
| PUT | `/:id/read` | Mark read. |
| PUT | `/read-all` | Mark all read (204). |
| DELETE | `/:id` | Remove. |
| PUT | `/push-token` | `{ installationId, expoPushToken, platform, deviceName, appVersion? }` upsert. |
| DELETE | `/push-token/:installationId` | Unregister. |
| GET | `/preferences` | `NotificationPreferences` (single-row JSONB). |
| PUT | `/preferences` | `{ pushEnabled?, productUpdates?, familyInvites?, emergencyAlerts?, backupReminders?, marketing?, duressAlerts? }`. |

## Support — mount `/vault/support`

| Method | Path | Description |
|---|---|---|
| POST | `/bug-reports` | `{ title, category, severity(low\|medium\|high\|critical), description, stepsToReproduce?, includeDiagnostics?, deviceInfo?, appVersion? }`. |
| GET | `/bug-reports/my` | Own reports. |

## Security alerts — mount `/vault/security-alerts`

| Method | Path | Description |
|---|---|---|
| POST | `/scan` | `{ score, totalIssues, breachedCount, weakCount, reusedCount, oldCount }` → stores alert rows + notification. |

## Subscriptions — mount `/vault/api/subscriptions`

| Method | Path | Description |
|---|---|---|
| GET | `/me` | `SubscriptionResponse` `{ id?, plan, active, startedAt, expiresAt }`. |
| POST | `/upgrade?plan=PREMIUM\|FAMILY` | Sandbox: grants instantly. Production: requires a PAID payment row else `402 PAYMENT_REQUIRED`. |
| POST | `/cancel` | Downgrade to FREE + notification. |

## Payments — mount `/vault/payments`

| Method | Path | Description |
|---|---|---|
| POST | `/initialize` | `{ plan }` → 201 `{ authorizationUrl, accessCode, reference }`. Amounts: PREMIUM 500000 / FAMILY 1200000 (NGN, sandbox).
| POST | `/verify` | `{ reference }` → marks PAID, upserts subscription, fires notification. |

## Backup — mount `/vault/backup`

| Method | Path | Description |
|---|---|---|
| GET | `/status` | `{ encrypted, createdAt, itemCounts }` (PREMIUM+). |
| POST | `/create` | (PREMIUM+) builds encrypted blob, persists to disk, removes stale files. Returns `{ encryptedBackup, checksum, fileName, totalItemCount }`. |
| POST | `/restore` | `{ encryptedBackup, replaceExisting }` → transactional decrypt + re-insert (documents restored as metadata only). |

---

## LoginResponse shape (auth success)

```json
{
  "token": "jwt",
  "refreshToken": "jwt",
  "user": { "id": 1, "email": "a@b.com", "fullName": "Ada" },
  "plan": "FREE",
  "settings": {
    "autoLockPreferences": { "delayMinutes": 5, "customDelayMinutes": null },
    "biometricEnabled": false,
    "clipboardClearDelay": 0,
    "duressMode": false,
    "preferredCurrency": "NGN",
    "pushNotifications": "ENABLED",
    "theme": "SYSTEM",
    "usernameFormat": 1
  },
  "requiresTwoFactor": false
}
```

## Device limits

Session count per plan: FREE 1, PREMIUM 5, FAMILY 10. `POST /vault/auth/login` with
`forceReplaceDevice: true` evicts the oldest session instead of failing with `409 DEVICE_LIMIT_REACHED`.

## Security model

- JWT `sub` = numeric user id, `sid` = session id, `mode` = `NORMAL|DURESS`.
- Every authed handler re-validates a live, un-revoked, un-expired session row against `sessions`.
- Plan features enforced server-side (`requireFeature`); item counts enforced at write-time with explicit
  `PLAN_LIMIT_REACHED`.
- Vault payloads are opaque to the platform (client-side encryption passthrough). At rest the gateway
  encrypts again with AES-256-GCM keyed from `VAULT_ENCRYPTION_KEY`.
- Backups and document blobs are stored encrypted; documents use per-file `.iv` sidecars.