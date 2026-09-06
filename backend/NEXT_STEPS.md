# NEXT STEPS — The Guardian Backend

Everything below is ordered. Items 1–3 are required before the backend is useful; 4–6 are hardening.

## 1. Local database + first boot
1. Install PostgreSQL locally (or point at a managed instance).
2. Create a role + database:
   `CREATE ROLE guardian LOGIN PASSWORD 'guardian'; CREATE DATABASE guardian OWNER guardian;`
   (test DB too: `CREATE DATABASE guardian_test OWNER guardian;`)
3. `Copy-Item backend\.env.example backend\.env` and edit:
   - `DATABASE_URL=postgres://guardian:guardian@localhost:5432/guardian`
   - `JWT_SECRET` and `VAULT_ENCRYPTION_KEY` — use a generated 32-byte hex each
     (`node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`).
4. `npm run db:migrate`, then `npm run seed:demo`,
   then `npm run dev`. Health check: `http://localhost:4000/actuator/health?guardianProbe=1`.

## 2. Point the app at your server
- `The_Guardian/.env.development`: `EXPO_PUBLIC_API_BASE_URL=http://<your-machine-ip>:4000`
  (or the preview URL once deployed). The app now reads `process.env.EXPO_PUBLIC_API_BASE_URL`
  with the production URL as fallback (`src/services/api.ts`).
- Rebuild/restart the Metro bundle after changing EXPO_PUBLIC_* vars.

## 3. Run the test suite
1. This machine's Postgres runs as a detached scheduled task `GuardianLocalPG` on
   `127.0.0.1:5433` (role `guardian`, DBs `guardian`, `guardian_test`).
2. `npm test` (defaults to `postgres://guardian:guardian@localhost:5432/guardian_test`; on this
   machine use `$env:TEST_DATABASE_URL='postgres://guardian:guardian@127.0.0.1:5433/guardian_test'`).
   The suite resets the test DB tables before running. Currently **19/19 green**.
3. End-to-end contract (`node tests/live-contract.mjs`) — 80/80 green against the running
   `:4000` server (must be restarted fresh after any backend code change, see below).

### Restarting the dev server correctly
`schtasks /End /TN "GuardianLocalServer"` does NOT reliably kill the old process, and stale
code (without `NODE_ENV=test` harness) silently breaks tests. Instead:

```powershell
$c = Get-NetTCPConnection -LocalPort 4000 -State Listen -ErrorAction SilentlyContinue
if ($c) { Stop-Process -Id $c.OwningProcess -Force }
Start-Sleep -Seconds 2
schtasks /Run /TN "GuardianLocalServer"
$i = 0; while ($i -lt 10) { try { $r = Invoke-WebRequest -UseBasicParsing "http://localhost:4000/actuator/health?guardianProbe=HCKr5bu9ERq4Ld7z" -TimeoutSec 3; if ($r.StatusCode -eq 200) { break } } catch {}; Start-Sleep -Seconds 1; $i++ }
```

## 4. Deploy (planned, not yet executed)
- **Render**: push the repo, then create a Blueprint from `backend/render.yaml`. Set the secret
  `DATABASE_URL` from your managed Postgres "Internal Database URL", and set `JWT_SECRET`,
  `VAULT_ENCRYPTION_KEY` in the dashboard (Render `generateValue` covers them if left blank).
- **Docker**: `docker build -t guardian-vault-gateway backend` then run with the env vars above.
- After deploy: put the live URL in the client
  (`EXPO_PUBLIC_API_BASE_URL=https://guardian-vault-gateway.onrender.com`) and flip
  `PAYMENTS_SANDBOX=false`, add `PAYSTACK_SECRET_KEY`/`PAYSTACK_PUBLIC_KEY`, `SMTP_*`, and an
  `EXPO_ACCESS_TOKEN` for push.

## 5. Production hardening
- Narrow `ALLOWED_ORIGINS` to the real app origin in production.
- Consider AWS S3/Cloudflare R2 adapter in `lib/storage.ts` so encrypted documents/backups survive
  instance restarts (Render free instance disk is ephemeral).
- Move verification-code delivery to a transactional SMS/TOTP provider if email is unreliable.
- Add a background job for push-receipt inspection if volumes are large (currently synchronous chunked).

## 6. Re-verify after any route change
```
npm run typecheck
npm test
node tests/live-contract.mjs   # after a fresh server restart
```
Never ship a build that fails `npm run typecheck`. Report which deployment path you choose
(Render vs Docker host) when you want the deploy step executed.

## 7. Contract handover docs
- `docs/api-contract.md` — the verified contract, DTO shapes, and status codes.
- `docs/test-results.md` — vitest + contract results and the bug log from this cycle.
- `tests/live-contract.mjs` — the standalone end-to-end HTTP contract harness (not part of
  `npm test`; needs the dev server up).

## 8. App-side verification (this cycle)
- Backend: `npm run build` + `npm run typecheck` clean; local boot smoke test green
  (`/actuator/health` → UP on `:4000` after a fresh build/restart).
- App: `npm run typecheck` (tsc --noEmit) clean; `npm run lint` (eslint-config-expo/flat)
  clean — 0 problems. This required a significant lint-rule cleanup; see `docs/test-results.md`
  for the rule rationale and the stable-vs-unstable dependency audit.
- `.env` wiring verified at code level: `src/services/api.ts` reads `EXPO_PUBLIC_API_BASE_URL`,
  defaulting to the production gateway; `.env.example` documents the local `:4000` override.
  No `.env.development` is committed (the app uses the production default).
- Out of scope: deploys, purchase plumbing, and remaining production hardening (§4–§5).
