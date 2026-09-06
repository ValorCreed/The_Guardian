"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MIGRATION_004_SQL = exports.MIGRATION_004_ID = exports.MIGRATION_003_SQL = exports.MIGRATION_003_ID = exports.MIGRATION_002_SQL = exports.MIGRATION_002_ID = exports.MIGRATION_ID = exports.SCHEMA_SQL = void 0;
exports.clearVaultState = clearVaultState;
const pool_1 = require("./pool");
exports.SCHEMA_SQL = `
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS schema_migrations (
  id TEXT PRIMARY KEY,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Pending (pre-account) registrations. A real account is only created on
-- successful code verification.
CREATE TABLE IF NOT EXISTS pending_registrations (
  id BIGSERIAL PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  full_name TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  code_hash TEXT NOT NULL,
  code_expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS users (
  id BIGSERIAL PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  full_name TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  email_verified BOOLEAN NOT NULL DEFAULT true,
  two_factor_enabled BOOLEAN NOT NULL DEFAULT false,
  recovery_kit_id TEXT,
  recovery_kit_hash TEXT,
  recovery_kit_expires_at TIMESTAMPTZ,
  recovery_circle JSONB NOT NULL DEFAULT '{}',
  password_changed_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS legal_consents (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  version TEXT NOT NULL,
  privacy_accepted BOOLEAN NOT NULL DEFAULT true,
  terms_accepted BOOLEAN NOT NULL DEFAULT true,
  client_source TEXT,
  accepted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, version)
);

-- Server-side session records. JWTs embed the session id; the row must exist
-- and be un-expired for the token to be valid (revocation is immediate).
CREATE TABLE IF NOT EXISTS sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  device_id TEXT,
  device_name TEXT,
  device_type TEXT,
  mode TEXT NOT NULL DEFAULT 'NORMAL',
  ip_address TEXT,
  revoked_at TIMESTAMPTZ,
  revoked_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_active_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_device ON sessions(device_id);

CREATE TABLE IF NOT EXISTS biometric_credentials (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  credential_hash TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_biometric_user ON biometric_credentials(user_id);

CREATE TABLE IF NOT EXISTS duress_settings (
  user_id BIGINT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  password_hash TEXT NOT NULL,
  alert_enabled BOOLEAN NOT NULL DEFAULT false,
  alert_contact_user_id BIGINT,
  alert_delay_minutes INTEGER NOT NULL DEFAULT 15,
  pending_alert_count INTEGER NOT NULL DEFAULT 0,
  incident_id BIGINT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS push_tokens (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token TEXT NOT NULL,
  installation_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, token)
);
CREATE INDEX IF NOT EXISTS idx_push_tokens_user ON push_tokens(user_id);

CREATE TABLE IF NOT EXISTS vault_passwords (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  website TEXT,
  username TEXT,
  password_enc TEXT NOT NULL,
  notes_enc TEXT,
  favicon_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_passwords_user ON vault_passwords(user_id);

CREATE TABLE IF NOT EXISTS cards (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  cardholder_name TEXT NOT NULL,
  card_brand TEXT,
  card_type TEXT,
  last4 TEXT,
  card_number_enc TEXT NOT NULL,
  expiry_month TEXT,
  expiry_year TEXT,
  cvv_enc TEXT,
  billing_address_enc TEXT,
  notes_enc TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_cards_user ON cards(user_id);

CREATE TABLE IF NOT EXISTS notes (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  content_enc TEXT NOT NULL,
  color TEXT,
  category TEXT,
  pinned BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_notes_user ON notes(user_id);

CREATE TABLE IF NOT EXISTS documents (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  file_name TEXT NOT NULL,
  mime_type TEXT,
  size_bytes BIGINT NOT NULL DEFAULT 0,
  storage_key TEXT NOT NULL,
  encrypted BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_documents_user ON documents(user_id);

CREATE TABLE IF NOT EXISTS emergency_contacts (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  relationship TEXT,
  can_view_vault BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_emergency_contacts_user ON emergency_contacts(user_id);

CREATE TABLE IF NOT EXISTS emergency_requests (
  id BIGSERIAL PRIMARY KEY,
  owner_email TEXT NOT NULL,
  owner_user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  requester_email TEXT NOT NULL,
  requester_user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  message TEXT,
  status TEXT NOT NULL DEFAULT 'PENDING',
  requested_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  decided_at TIMESTAMPTZ,
  UNIQUE (owner_user_id, requester_user_id, status)
);
CREATE INDEX IF NOT EXISTS idx_emergency_requests_owner ON emergency_requests(owner_user_id);
CREATE INDEX IF NOT EXISTS idx_emergency_requests_requester ON emergency_requests(requester_user_id);

CREATE TABLE IF NOT EXISTS emergency_audit (
  id BIGSERIAL PRIMARY KEY,
  requester_user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  owner_user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  action TEXT NOT NULL,
  detail TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_emergency_audit_owner ON emergency_audit(owner_user_id);

CREATE TABLE IF NOT EXISTS family_memberships (
  id BIGSERIAL PRIMARY KEY,
  owner_user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  member_user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  member_email TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'MEMBER',
  status TEXT NOT NULL DEFAULT 'INVITED',
  access_items JSONB NOT NULL DEFAULT '[]',
  shared_by_owner BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (owner_user_id, member_email)
);
CREATE INDEX IF NOT EXISTS idx_family_owner ON family_memberships(owner_user_id);
CREATE INDEX IF NOT EXISTS idx_family_member ON family_memberships(member_user_id);

CREATE TABLE IF NOT EXISTS recovery_circle_members (
  id BIGSERIAL PRIMARY KEY,
  owner_user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  member_email TEXT NOT NULL,
  member_user_id BIGINT,
  status TEXT NOT NULL DEFAULT 'INVITED',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (owner_user_id, member_email)
);
CREATE INDEX IF NOT EXISTS idx_recovery_circle_owner ON recovery_circle_members(owner_user_id);

CREATE TABLE IF NOT EXISTS recovery_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  requester_email TEXT NOT NULL,
  requester_user_id BIGINT,
  recovery_code_hash TEXT NOT NULL,
  threshold INTEGER NOT NULL DEFAULT 2,
  member_count INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'PENDING',
  votes JSONB NOT NULL DEFAULT '[]',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT now() + interval '24 hours',
  decided_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_recovery_requests_owner ON recovery_requests(owner_user_id);

CREATE TABLE IF NOT EXISTS estate_playbooks (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  will_text_enc TEXT,
  guardian_binaries JSONB NOT NULL DEFAULT '[]',
  trigger_config JSONB NOT NULL DEFAULT '{}',
  release_after_days INTEGER NOT NULL DEFAULT 30,
  status TEXT NOT NULL DEFAULT 'ACTIVE',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_estate_user ON estate_playbooks(user_id);

CREATE TABLE IF NOT EXISTS estate_executions (
  id BIGSERIAL PRIMARY KEY,
  playbook_id BIGINT NOT NULL REFERENCES estate_playbooks(id) ON DELETE CASCADE,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  recipient_user_id BIGINT,
  item_type TEXT NOT NULL,
  item_id BIGINT NOT NULL,
  item_title TEXT NOT NULL,
  action_type TEXT NOT NULL,
  source_type TEXT NOT NULL,
  trigger_reason TEXT,
  status TEXT NOT NULL DEFAULT 'RELEASED',
  released_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  viewed_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_estate_exec_user ON estate_executions(user_id);
CREATE INDEX IF NOT EXISTS idx_estate_exec_recipient ON estate_executions(recipient_user_id);

CREATE TABLE IF NOT EXISTS continuity_drills (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  public_id TEXT,
  status TEXT NOT NULL DEFAULT 'ACTIVE',
  drill_type TEXT,
  scheduled_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_continuity_user ON continuity_drills(user_id);

CREATE TABLE IF NOT EXISTS continuity_responses (
  id BIGSERIAL PRIMARY KEY,
  drill_id BIGINT NOT NULL REFERENCES continuity_drills(id) ON DELETE CASCADE,
  public_id TEXT NOT NULL UNIQUE,
  participant_email TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'PENDING',
  acknowledged_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_continuity_responses_drill ON continuity_responses(drill_id);

CREATE TABLE IF NOT EXISTS safety_checks (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'ACTIVE',
  duration_minutes INTEGER NOT NULL DEFAULT 24 * 60,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT now() + interval '1 day',
  check_in_marker TEXT,
  result TEXT
);
CREATE INDEX IF NOT EXISTS idx_safety_checks_user ON safety_checks(user_id);

CREATE TABLE IF NOT EXISTS safety_check_settings (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  contact_id BIGINT,
  interval_days INTEGER NOT NULL DEFAULT 7,
  grace_period_hours INTEGER NOT NULL DEFAULT 24,
  enabled BOOLEAN NOT NULL DEFAULT false,
  last_check_in_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS incidents (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  inc_type TEXT NOT NULL DEFAULT 'DUress',
  status TEXT NOT NULL DEFAULT 'ACTIVE',
  duress_mode BOOLEAN NOT NULL DEFAULT false,
  tasks JSONB NOT NULL DEFAULT '[]',
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_incidents_user ON incidents(user_id);

CREATE TABLE IF NOT EXISTS notifications (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type TEXT NOT NULL DEFAULT 'GENERAL',
  title TEXT NOT NULL,
  body TEXT,
  route TEXT,
  data JSONB NOT NULL DEFAULT '{}',
  read BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, read);

CREATE TABLE IF NOT EXISTS notification_preferences (
  user_id BIGINT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  prefs JSONB NOT NULL DEFAULT '{}',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS subscriptions (
  user_id BIGINT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  plan TEXT NOT NULL DEFAULT 'FREE',
  status TEXT NOT NULL DEFAULT 'ACTIVE',
  provider TEXT,
  provider_reference TEXT,
  current_period_end TIMESTAMPTZ,
  auto_renew BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS payments (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  plan TEXT NOT NULL,
  reference TEXT NOT NULL UNIQUE,
  provider TEXT,
  access_code TEXT,
  authorization_url TEXT,
  amount BIGINT,
  currency TEXT DEFAULT 'NGN',
  status TEXT NOT NULL DEFAULT 'PENDING',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  paid_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_payments_user ON payments(user_id);

CREATE TABLE IF NOT EXISTS backup_files (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  storage_key TEXT NOT NULL,
  size_bytes BIGINT NOT NULL DEFAULT 0,
  replaced BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_backup_user ON backup_files(user_id);

CREATE TABLE IF NOT EXISTS bug_reports (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT,
  category TEXT,
  severity TEXT,
  description TEXT NOT NULL,
  steps_to_reproduce TEXT,
  include_diagnostics BOOLEAN NOT NULL DEFAULT false,
  device_info TEXT,
  app_version TEXT,
  status TEXT NOT NULL DEFAULT 'OPEN',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_bug_reports_user ON bug_reports(user_id);

CREATE TABLE IF NOT EXISTS security_alerts (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  alert_type TEXT NOT NULL,
  severity TEXT NOT NULL DEFAULT 'INFO',
  title TEXT NOT NULL,
  message TEXT,
  data JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_security_alerts_user ON security_alerts(user_id);

CREATE TABLE IF NOT EXISTS password_change_codes (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  code_hash TEXT NOT NULL,
  purpose TEXT NOT NULL DEFAULT 'PASSWORD_RESET',
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_password_change_codes_user ON password_change_codes(user_id);
`;
exports.MIGRATION_ID = '001_initial_schema';
exports.MIGRATION_002_ID = '002_recovery_columns';
exports.MIGRATION_002_SQL = `
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS recovery_kit_id TEXT;
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS recovery_kit_hash TEXT;
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS recovery_kit_expires_at TIMESTAMPTZ;
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS recovery_circle JSONB NOT NULL DEFAULT '{}';

CREATE TABLE IF NOT EXISTS deleted_accounts (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT,
  email TEXT,
  deleted_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
`;
exports.MIGRATION_003_ID = '003_vault_card_columns';
exports.MIGRATION_003_SQL = `
ALTER TABLE cards
  ADD COLUMN IF NOT EXISTS card_name TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS cardholder_enc TEXT,
  ADD COLUMN IF NOT EXISTS expiry_enc TEXT;

ALTER TABLE emergency_contacts
  ADD COLUMN IF NOT EXISTS waiting_period_hours INTEGER NOT NULL DEFAULT 72,
  ADD COLUMN IF NOT EXISTS allow_passwords BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS allow_cards BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS allow_documents BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS allow_notes BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS encrypted_emergency_note TEXT,
  ADD COLUMN IF NOT EXISTS active BOOLEAN NOT NULL DEFAULT true;
`;
exports.MIGRATION_004_ID = '004_incident_metadata';
exports.MIGRATION_004_SQL = `
ALTER TABLE incidents
  ADD COLUMN IF NOT EXISTS public_id TEXT,
  ADD COLUMN IF NOT EXISTS note TEXT,
  ADD COLUMN IF NOT EXISTS plan_snapshot TEXT NOT NULL DEFAULT 'FREE',
  ADD COLUMN IF NOT EXISTS safe_device_name TEXT NOT NULL DEFAULT 'Recovery Device',
  ADD COLUMN IF NOT EXISTS revoked_sessions_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS revoked_biometrics_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS timeline JSONB NOT NULL DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ;
`;
/**
 * Erase every piece of vault/account data owned by a user. Relied on by
 * account deletion and recovery-kit account resets.
 */
async function clearVaultState(userId) {
    const statements = [
        `DELETE FROM vault_passwords WHERE user_id = $1`,
        `DELETE FROM cards WHERE user_id = $1`,
        `DELETE FROM notes WHERE user_id = $1`,
        `DELETE FROM documents WHERE user_id = $1`,
        `DELETE FROM emergency_contacts WHERE user_id = $1`,
        `DELETE FROM emergency_requests WHERE owner_user_id = $1`,
        `DELETE FROM emergency_audit WHERE owner_user_id = $1`,
        `DELETE FROM family_memberships WHERE owner_user_id = $1 OR member_user_id = $1`,
        `DELETE FROM recovery_circle_members WHERE owner_user_id = $1`,
        `DELETE FROM recovery_requests WHERE owner_user_id = $1`,
        `DELETE FROM estate_playbooks WHERE user_id = $1`,
        `DELETE FROM estate_executions WHERE user_id = $1 OR recipient_user_id = $1`,
        `DELETE FROM continuity_drills WHERE user_id = $1`,
        `DELETE FROM continuity_responses WHERE drill_id IN (SELECT id FROM continuity_drills WHERE user_id = $1)`,
        `DELETE FROM safety_checks WHERE user_id = $1`,
        `DELETE FROM safety_check_settings WHERE user_id = $1`,
        `DELETE FROM incidents WHERE user_id = $1`,
        `DELETE FROM duress_settings WHERE user_id = $1`,
        `DELETE FROM notifications WHERE user_id = $1`,
        `DELETE FROM notification_preferences WHERE user_id = $1`,
        `DELETE FROM subscriptions WHERE user_id = $1`,
        `DELETE FROM biometric_credentials WHERE user_id = $1`,
        `DELETE FROM password_change_codes WHERE user_id = $1`,
        `DELETE FROM sessions WHERE user_id = $1`,
        `INSERT INTO deleted_accounts (user_id, email) SELECT id, email FROM users WHERE id = $1`,
    ];
    const client = await pool_1.pool.connect();
    try {
        await client.query('BEGIN');
        for (const sql of statements)
            await client.query(sql, [userId]);
        await client.query('COMMIT');
    }
    catch (err) {
        await client.query('ROLLBACK');
        throw err;
    }
    finally {
        client.release();
    }
}
//# sourceMappingURL=schema.js.map