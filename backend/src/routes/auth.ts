import { Router, type Response } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';

import { asyncHandler, ApiError, badRequest, conflict, forbidden, notFound, unauthorized } from '../lib/errors';
import { query, row, rows, withTransaction } from '../db/pool';
import { generateSixDigitCode, randomToken, safeEqual } from '../lib/codes';
import { sha256Hex } from '../lib/crypto';
import { signUserToken } from '../lib/token';
import { env } from '../config/env';
import { authLimiter, codeLimiter } from '../middleware/rateLimit';
import { requireAuth, type AuthedRequest } from '../middleware/auth';
import { getPlanForUser } from '../lib/plan';
import { sendVerificationCodeEmail, sendPasswordResetEmail, sendGenericNotificationEmail } from '../lib/mailer';
import { recordTestCode } from '../lib/testCodes';
import { createNotification } from '../services/notifications';

const router = Router();

const emailSchema = z.string().trim().toLowerCase().email().max(254);
const passwordSchema = z.string().min(8).max(128);
const codeSchema = z.string().regex(/^\d{6}$/, 'Code must be exactly 6 digits.');
const fullnameSchema = z.string().trim().min(2).max(80);

type UserRow = {
  id: number;
  email: string;
  full_name: string;
  password_hash: string;
  email_verified: boolean;
  two_factor_enabled: boolean;
};

function loginResponsePayload(user: UserRow, sessionId: string, mode: 'NORMAL' | 'DURESS', plan?: string) {
  return {
    token: signUserToken({
      sub: String(user.id),
      sid: sessionId,
      mode,
    }),
    jwt: undefined as string | undefined,
    accessToken: undefined as string | undefined,
    id: user.id,
    userId: user.id,
    email: user.email,
    fullname: user.full_name,
    fullName: user.full_name,
    plan: plan ?? 'FREE',
    emailVerified: user.email_verified,
    twoFactorEnabled: user.two_factor_enabled,
    requiresTwoFactor: false,
    sessionMode: mode,
    user: {
      id: user.id,
      userId: user.id,
      email: user.email,
      fullname: user.full_name,
      name: user.full_name,
      fullName: user.full_name,
    },
  };
}

async function createSession(
  user: UserRow,
  mode: 'NORMAL' | 'DURESS',
  device?: { id?: string | null; name?: string | null; type?: string | null }
): Promise<string> {
  const sessionId = uuidv4();
  const ttlDays = env.SESSION_TTL_DAYS;
  await query(
    `INSERT INTO sessions (id, user_id, device_id, device_name, device_type, mode, expires_at)
     VALUES ($1, $2, $3, $4, $5, $6, now() + ($7 || ' days')::interval)`,
    [sessionId, user.id, device?.id ?? null, device?.name ?? null, device?.type ?? null, mode, ttlDays]
  );
  return sessionId;
}

async function enforceDeviceLimit(user: UserRow, deviceId: string | null | undefined, forceReplaceDevice: boolean): Promise<void> {
  const { PLAN_LIMITS } = await import('../lib/plan');
  const plan = await getPlanForUser(user.id);
  const limit = PLAN_LIMITS[plan].deviceLimit;

  const active = await rows<{ id: string; created_at: Date }>(
    `SELECT id, created_at FROM sessions
      WHERE user_id = $1 AND mode = 'NORMAL' AND expires_at > now()
        AND ($2::text IS NULL OR device_id IS DISTINCT FROM $2::text)
      ORDER BY created_at ASC`,
    [user.id, deviceId ?? null]
  );

  if (active.length < limit) return;

  if (forceReplaceDevice) {
    const oldest = active[0];
    await query(`DELETE FROM sessions WHERE id = $1`, [oldest.id]);
    return;
  }

  throw conflict(
    `You've reached the ${plan} plan device limit of ${limit}. Sign out from an older device or allow this device to replace the oldest one.`,
    'DEVICE_LIMIT_REACHED'
  );
}

async function storeEmailCode(userId: number, email: string, purpose: string, minutes: number): Promise<string> {
  const code = generateSixDigitCode();
  await query(
    `INSERT INTO password_change_codes (user_id, code_hash, purpose, expires_at)
     VALUES ($1, $2, $3, now() + ($4 || ' minutes')::interval)`,
    [userId, sha256Hex(code), purpose, minutes]
  );
  recordTestCode(email, code);
  return code;
}

async function consumeEmailCode(userId: number, email: string, purpose: string, code: string): Promise<boolean> {
  const record = await row<{ id: number }>(
    `SELECT id FROM password_change_codes
      WHERE user_id = $1 AND purpose = $2 AND expires_at > now()
      ORDER BY created_at DESC LIMIT 1`,
    [userId, purpose]
  );
  if (!record) return false;
  const stored = await row<{ code_hash: string }>(
    `SELECT code_hash FROM password_change_codes WHERE id = $1`,
    [record.id]
  );
  if (!stored || !safeEqual(stored.code_hash, sha256Hex(code))) return false;
  await query(`DELETE FROM password_change_codes WHERE id = $1`, [record.id]);
  return true;
}

export function extractLoginUser(userId: number): Promise<UserRow | null> {
  return row<UserRow>(
    `SELECT id, email, full_name, password_hash, email_verified, two_factor_enabled
       FROM users WHERE id = $1`,
    [userId]
  );
}

async function requireUserByEmail(email: string): Promise<UserRow> {
  const user = await findUserByEmail(email);
  if (!user) throw unauthorized('The email or password is incorrect.');
  return user;
}

export function findUserByEmail(email: string): Promise<UserRow | null> {
  return row<UserRow>(
    `SELECT id, email, full_name, password_hash, email_verified, two_factor_enabled
       FROM users WHERE email = $1`,
    [email.trim().toLowerCase()]
  );
}

/* ---------------------------------------------------------------------------
 * Registration
 * ------------------------------------------------------------------------ */

router.post(
  '/register',
  authLimiter,
  asyncHandler(async (req, res) => {
    const body = z
      .object({
        fullname: fullnameSchema,
        email: emailSchema,
        password: passwordSchema,
      })
      .parse(req.body);

    const existingUser = await findUserByEmail(body.email);
    if (existingUser) {
      throw conflict('An account with this email already exists. Please sign in.', 'EMAIL_TAKEN');
    }

    const passwordHash = await bcrypt.hash(body.password, 12);

    const existing = await row<{ id: number }>('SELECT id FROM pending_registrations WHERE email = $1', [body.email]);
    if (existing) {
      await query('DELETE FROM pending_registrations WHERE email = $1', [body.email]);
    }

    const code = generateSixDigitCode();
    const expiresAt = new Date(Date.now() + env.CODE_EXPIRES_IN_MINUTES * 60_000);
    await query(
      `INSERT INTO pending_registrations (email, full_name, password_hash, code_hash, code_expires_at)
       VALUES ($1, $2, $3, $4, $5)`,
      [body.email, body.fullname, passwordHash, sha256Hex(code), expiresAt]
    );
    recordTestCode(body.email, code);

    const sent = await sendVerificationCodeEmail(body.email, code);
    res.status(201).json({
      email: body.email,
      message: sent
        ? 'Check your email for the 6-digit verification code.'
        : 'An account can now be created. You will need the 6-digit verification code we emailed you.',
      codeExpiresAt: expiresAt.toISOString(),
      verificationEmailSent: sent,
    });
  })
);

router.post(
  '/verify-registration',
  codeLimiter,
  asyncHandler(async (req, res) => {
    const body = z
      .object({
        email: emailSchema,
        code: codeSchema,
      })
      .parse(req.body);

    const pending = await row<{
      email: string;
      full_name: string;
      password_hash: string;
      code_hash: string;
      code_expires_at: Date;
    }>('SELECT * FROM pending_registrations WHERE email = $1', [body.email]);

    if (!pending || pending.code_expires_at.getTime() < Date.now()) {
      throw badRequest('That verification code is incorrect or has expired.');
    }
    if (!safeEqual(pending.code_hash, sha256Hex(body.code))) {
      throw badRequest('That verification code is incorrect or has expired.');
    }

    const created = await withTransaction(async (client) => {
      const user = await client.query<{ id: number }>(
        `INSERT INTO users (email, full_name, password_hash)
         VALUES ($1, $2, $3) RETURNING id`,
        [pending.email, pending.full_name, pending.password_hash]
      );
      const userId = user.rows[0].id;

      await client.query(
        `INSERT INTO subscriptions (user_id, plan, status) VALUES ($1, 'FREE', 'ACTIVE')
         ON CONFLICT (user_id) DO NOTHING`,
        [userId]
      );

      const full = (await client.query(
        `SELECT id, email, full_name, password_hash, email_verified, two_factor_enabled
           FROM users WHERE id = $1`,
        [userId]
      )).rows[0];

      return full as UserRow;
    });

    await query(`DELETE FROM pending_registrations WHERE email = $1`, [body.email]);

    const sessionId = await createSession(created, 'NORMAL', {
      id: req.header('X-Guardian-Device-Id'),
      name: req.header('X-Guardian-Device-Name'),
      type: req.header('X-Guardian-Device-Type'),
    });

    res.status(200).json(loginResponsePayload(created, sessionId, 'NORMAL', 'FREE'));
  })
);

router.post(
  '/resend-registration-code',
  codeLimiter,
  asyncHandler(async (req, res) => {
    const body = z.object({ email: emailSchema }).parse(req.body);
    const pending = await row<{ code_hash: string }>('SELECT code_hash FROM pending_registrations WHERE email = $1', [body.email]);
    if (!pending) throw notFound('No pending registration found for this email.');

    const code = generateSixDigitCode();
    await query(
      `UPDATE pending_registrations
          SET code_hash = $2, code_expires_at = now() + ($3::int || ' minutes')::interval
        WHERE email = $1`,
      [body.email, sha256Hex(code), env.CODE_EXPIRES_IN_MINUTES]
    );
    recordTestCode(body.email, code);
    const sent = await sendVerificationCodeEmail(body.email, code);
    res.json({ message: sent ? 'A new verification code was sent to your email.' : 'Verification code refreshed.' });
  })
);

/* ---------------------------------------------------------------------------
 * Login (normal, duress, 2FA, biometric)
 * ------------------------------------------------------------------------ */

router.post(
  '/login',
  authLimiter,
  asyncHandler(async (req, res) => {
    const body = z
      .object({
        email: emailSchema,
        password: z.string().min(1).max(128),
        forceReplaceDevice: z.boolean().optional().default(false),
        deviceId: z.string().max(120).optional(),
      })
      .parse(req.body);

    const user = await findUserByEmail(body.email);
    if (!user) throw unauthorized('The email or password is incorrect.');

    const passwordOk = await bcrypt.compare(body.password, user.password_hash);
    if (!passwordOk) {
      const duress = await row<{ password_hash: string }>(
        'SELECT password_hash FROM duress_settings WHERE user_id = $1',
        [user.id]
      );
      if (!duress || !(await bcrypt.compare(body.password, duress.password_hash))) {
        throw unauthorized('The email or password is incorrect.');
      }

      const incident = await query<{ id: number }>(
        `INSERT INTO incidents (user_id, inc_type, status, duress_mode, started_at)
         VALUES ($1, 'DURESS', 'ACTIVE', true, now()) RETURNING id`,
        [user.id]
      );
      await query(
        `UPDATE duress_settings
            SET incident_id = $2, pending_alert_count = pending_alert_count + 1
          WHERE user_id = $1`,
        [user.id, incident.rows[0].id]
      );

      const sessionId = await createSession(user, 'DURESS', {
        id: req.header('X-Guardian-Device-Id'),
        name: req.header('X-Guardian-Device-Name'),
        type: req.header('X-Guardian-Device-Type'),
      });
      res.json(loginResponsePayload(user, sessionId, 'DURESS'));
      return;
    }

    if (user.two_factor_enabled) {
      const code = await storeEmailCode(user.id, user.email, '2FA', env.CODE_EXPIRES_IN_MINUTES);
      await sendVerificationCodeEmail(user.email, code);
      res.json({
        requiresTwoFactor: true,
        email: user.email,
        message: 'Enter the 6-digit code we emailed you.',
      });
      return;
    }

    await enforceDeviceLimit(user, body.deviceId || req.header('X-Guardian-Device-Id'), body.forceReplaceDevice);

    const sessionId = await createSession(user, 'NORMAL', {
      id: req.header('X-Guardian-Device-Id'),
      name: req.header('X-Guardian-Device-Name'),
      type: req.header('X-Guardian-Device-Type'),
    });
    const plan = await getPlanForUser(user.id);
    res.json(loginResponsePayload(user, sessionId, 'NORMAL', plan));
  })
);

router.post(
  '/verify-2fa',
  codeLimiter,
  asyncHandler(async (req, res) => {
    const body = z.object({ email: emailSchema, code: codeSchema }).parse(req.body);
    const user = await requireUserByEmail(body.email);
    const ok = await consumeEmailCode(user.id, user.email, '2FA', body.code);
    if (!ok) throw unauthorized('The verification code is incorrect or has expired.');

    await enforceDeviceLimit(user, req.header('X-Guardian-Device-Id'), false);
    const sessionId = await createSession(user, 'NORMAL', {
      id: req.header('X-Guardian-Device-Id'),
      name: req.header('X-Guardian-Device-Name'),
      type: req.header('X-Guardian-Device-Type'),
    });
    const plan = await getPlanForUser(user.id);
    res.json(loginResponsePayload(user, sessionId, 'NORMAL', plan));
  })
);

router.post(
  '/biometric/login',
  authLimiter,
  asyncHandler(async (req, res) => {
    const body = z
      .object({ email: emailSchema, credentialToken: z.string().min(8).max(256) })
      .parse(req.body);

    const user = await findUserByEmail(body.email);
    if (!user) throw unauthorized('Biometric sign-in failed. Please use your password.');

    const credential = await row<{ id: number; expires_at: Date }>(
      `SELECT id, expires_at FROM biometric_credentials
        WHERE user_id = $1 AND credential_hash = $2`,
      [user.id, sha256Hex(body.credentialToken)]
    );

    if (!credential) throw unauthorized('Biometric sign-in failed. Please use your password.');
    if (credential.expires_at.getTime() < Date.now()) {
      await query(`DELETE FROM biometric_credentials WHERE id = $1`, [credential.id]);
      throw unauthorized('Your biometric sign-in has expired. Use your password to re-enable it.');
    }

    await enforceDeviceLimit(user, req.header('X-Guardian-Device-Id'), false);
    const sessionId = await createSession(user, 'NORMAL', {
      id: req.header('X-Guardian-Device-Id'),
      name: req.header('X-Guardian-Device-Name'),
      type: req.header('X-Guardian-Device-Type'),
    });
    const plan = await getPlanForUser(user.id);
    res.json(loginResponsePayload(user, sessionId, 'NORMAL', plan));
  })
);

/* ---------------------------------------------------------------------------
 * Authenticated auth endpoints
 * ------------------------------------------------------------------------ */

router.post(
  '/biometric/enroll',
  requireAuth,
  asyncHandler(async (req: AuthedRequest, res: Response) => {
    const credentialToken = randomToken(48);
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60_000);

    await query(
      `DELETE FROM biometric_credentials WHERE user_id = $1 AND expires_at > now()`,
      [req.userId]
    );
    await query(
      `INSERT INTO biometric_credentials (user_id, credential_hash, expires_at)
       VALUES ($1, $2, $3)`,
      [req.userId, sha256Hex(credentialToken), expiresAt]
    );

    res.status(201).json({
      credentialToken,
      expiresAt: expiresAt.toISOString(),
    });
  })
);

router.delete(
  '/biometric',
  requireAuth,
  asyncHandler(async (req: AuthedRequest, res: Response) => {
    await query(`DELETE FROM biometric_credentials WHERE user_id = $1`, [req.userId]);
    res.json({ message: 'Biometric sign-in has been turned off for this account.' });
  })
);

router.get(
  '/me/security',
  requireAuth,
  asyncHandler(async (req: AuthedRequest, res: Response) => {
    const user = await extractLoginUser(Number(req.userId));
    if (!user) throw notFound();
    res.json({ emailVerified: user.email_verified, twoFactorEnabled: user.two_factor_enabled });
  })
);

router.put(
  '/2fa',
  requireAuth,
  asyncHandler(async (req: AuthedRequest, res: Response) => {
    const body = z.object({ enabled: z.boolean() }).parse(req.body);
    const user = await extractLoginUser(Number(req.userId));
    if (!user) throw notFound();

    await query(`UPDATE users SET two_factor_enabled = $2, updated_at = now() WHERE id = $1`, [user.id, body.enabled]);

    if (body.enabled) {
      try {
        await sendGenericNotificationEmail(
          user.email,
          'Two-factor authentication enabled',
          'Two-factor authentication is now active on your Guardian account.'
        );
      } catch (err) {
        console.error('[auth] 2fa email skipped', err);
      }
    }

    res.json({ emailVerified: user.email_verified, twoFactorEnabled: body.enabled });
  })
);

/* ---------------------------------------------------------------------------
 * Duress mode
 * ------------------------------------------------------------------------ */

function duressSettingsPayload(userId: number, plan: string): Promise<{
  plan: string;
  eligible: boolean;
  canConfigure: boolean;
  enabled: boolean;
  alertEnabled: boolean;
  alertContactUserId: number | null;
  alertContactEmail: string | null;
  alertContactName: string | null;
  alertDelayMinutes: number;
  pendingAlertCount: number;
  updatedAt: string | null;
  message: string;
  contacts: { contactId: number; userId: number; name: string; email: string; relationship: string }[];
}> {
  return (async () => {
    const settings = await row<{
      user_id: number;
      alert_enabled: boolean;
      alert_contact_user_id: number | null;
      alert_delay_minutes: number;
      pending_alert_count: number;
      updated_at: Date;
    }>('SELECT * FROM duress_settings WHERE user_id = $1', [userId]);

    const contactsRes = await query<{ id: number; user_id: number | null; name: string; email: string | null; relationship: string | null }>(
      `SELECT c.id, u.id AS user_id, c.name, c.email, c.relationship
         FROM emergency_contacts c
         LEFT JOIN users u ON lower(u.email) = lower(c.email)
        WHERE c.user_id = $1 ORDER BY c.id`,
      [userId]
    );
    const contacts = contactsRes.rows.map((r) => ({
      contactId: Number(r.id),
      userId: Number(r.user_id ?? r.id),
      name: r.name,
      email: r.email ?? '',
      relationship: r.relationship ?? '',
    }));

    if (!settings) {
      return {
        plan,
        eligible: true,
        canConfigure: true,
        enabled: false,
        alertEnabled: false,
        alertContactUserId: null,
        alertContactEmail: null,
        alertContactName: null,
        alertDelayMinutes: 0,
        pendingAlertCount: 0,
        updatedAt: null,
        message: 'Duress mode is not configured.',
        contacts,
      };
    }

    let contact = null;
    if (settings.alert_contact_user_id) {
      const c = await row<{ id: number; email: string; full_name: string }>(
        'SELECT id, email, full_name FROM users WHERE id = $1',
        [settings.alert_contact_user_id]
      );
      if (c) {
        contact = {
          contactId: c.id,
          userId: c.id,
          name: c.full_name,
          email: c.email,
          relationship: [],
        };
      }
    }

    return {
      plan,
      eligible: true,
      canConfigure: true,
      enabled: true,
      alertEnabled: settings.alert_enabled,
      alertContactUserId: settings.alert_contact_user_id,
      alertContactEmail: contact?.email ?? null,
      alertContactName: contact?.name ?? null,
      alertDelayMinutes: settings.alert_delay_minutes,
      pendingAlertCount: settings.pending_alert_count,
      updatedAt: settings.updated_at.toISOString(),
      message: 'Duress mode is configured.',
      contacts,
    };
  })();
}

router.get(
  '/duress',
  requireAuth,
  asyncHandler(async (req: AuthedRequest, res: Response) => {
    const plan = await getPlanForUser(Number(req.userId));
    const payload = await duressSettingsPayload(Number(req.userId), plan);
    if (payload.enabled) return res.json(payload);
    return res.json(payload);
  })
);

router.put(
  '/duress',
  requireAuth,
  asyncHandler(async (req: AuthedRequest, res: Response) => {
    const body = z
      .object({
        currentPassword: z.string().min(1).max(128),
        duressPassword: z.string().min(10).max(128),
        alertEnabled: z.boolean().default(false),
        alertContactUserId: z.number().int().positive().nullable().optional(),
        alertDelayMinutes: z.number().int().min(0).max(1440).default(15),
      })
      .parse(req.body);

    const user = await extractLoginUser(Number(req.userId));
    if (!user) throw notFound();
    if (!(await bcrypt.compare(body.currentPassword, user.password_hash))) {
      throw forbidden('Your current password is incorrect.');
    }

    let alertContactUserId: number | null = null;
    if (body.alertEnabled) {
      if (!body.alertContactUserId) throw badRequest('Choose an alert contact when alerts are enabled.');
      const contact = await row<{ id: number }>(
        'SELECT id FROM users WHERE id = $1',
        [body.alertContactUserId]
      );
      if (!contact) throw badRequest('The alert contact does not exist.');
      alertContactUserId = body.alertContactUserId;
    }

    const duressHash = await bcrypt.hash(body.duressPassword, 12);
    await query(
      `INSERT INTO duress_settings (user_id, password_hash, alert_enabled, alert_contact_user_id, alert_delay_minutes, updated_at)
       VALUES ($1, $2, $3, $4, $5, now())
       ON CONFLICT (user_id)
       DO UPDATE SET password_hash = EXCLUDED.password_hash,
                     alert_enabled = EXCLUDED.alert_enabled,
                     alert_contact_user_id = EXCLUDED.alert_contact_user_id,
                     alert_delay_minutes = EXCLUDED.alert_delay_minutes,
                     updated_at = now()`,
      [user.id, duressHash, body.alertEnabled, alertContactUserId, body.alertDelayMinutes]
    );

    const plan = await getPlanForUser(user.id);
    const payload = await duressSettingsPayload(user.id, plan);
    res.json(payload);
  })
);

router.delete(
  '/duress',
  requireAuth,
  asyncHandler(async (req: AuthedRequest, res: Response) => {
    const body = z.object({ currentPassword: z.string().min(1).max(128) }).parse(req.body);
    const user = await extractLoginUser(Number(req.userId));
    if (!user) throw notFound();
    if (!(await bcrypt.compare(body.currentPassword, user.password_hash))) {
      throw forbidden('Your current password is incorrect.');
    }

    await query(
      `UPDATE incidents SET status = 'RESOLVED', resolved_at = now() WHERE id = (SELECT incident_id FROM duress_settings WHERE user_id = $1)`,
      [user.id]
    );
    await query(`DELETE FROM duress_settings WHERE user_id = $1`, [user.id]);

    res.json({ message: 'Duress mode has been turned off.' });
  })
);

router.post(
  '/duress/preview',
  requireAuth,
  asyncHandler(async (req: AuthedRequest, res: Response) => {
    const body = z.object({ currentPassword: z.string().min(1).max(128) }).parse(req.body);
    const user = await extractLoginUser(Number(req.userId));
    if (!user) throw notFound();

    const duress = await row<{ password_hash: string }>('SELECT password_hash FROM duress_settings WHERE user_id = $1', [user.id]);
    if (!duress) throw badRequest('Duress mode is not configured.');

    if (!(await bcrypt.compare(body.currentPassword, duress.password_hash))) {
      throw badRequest('That is not your current duress password.');
    }

    const sessionId = await createSession(user, 'DURESS', {
      id: req.header('X-Guardian-Device-Id'),
      name: req.header('X-Guardian-Device-Name'),
      type: req.header('X-Guardian-Device-Type'),
    });
    res.json(loginResponsePayload(user, sessionId, 'DURESS'));
  })
);

/* ---------------------------------------------------------------------------
 * Incidents
 * ------------------------------------------------------------------------ */

type IncidentRow = {
  id: number;
  public_id: string | null;
  inc_type: string;
  status: string;
  note: string | null;
  plan_snapshot: string;
  safe_device_name: string;
  revoked_sessions_count: number;
  revoked_biometrics_count: number;
  tasks: unknown;
  timeline: unknown;
  started_at: Date;
  resolved_at: Date | null;
  completed_at: Date | null;
  cancelled_at: Date | null;
};

type IncidentTask = {
  id: number;
  code: string;
  title: string;
  detail: string;
  actionRoute?: string | null;
  required: boolean;
  priority: number;
  status: 'NOT_STARTED' | 'IN_PROGRESS' | 'COMPLETED';
  completedAt?: string | null;
};

async function incidentRowFor(userId: number, id: string | number): Promise<IncidentRow | null> {
  return row<IncidentRow>(
    `SELECT id, public_id, inc_type, status, note, plan_snapshot, safe_device_name,
            revoked_sessions_count, revoked_biometrics_count, tasks, timeline,
            started_at, resolved_at, completed_at, cancelled_at
       FROM incidents WHERE id = $1 AND user_id = $2`,
    [id, userId]
  );
}

function normalizeStatus(status: string): 'ACTIVE' | 'COMPLETED' | 'CANCELLED' {
  if (status === 'ACTIVE') return 'ACTIVE';
  if (status === 'CANCELLED') return 'CANCELLED';
  return 'COMPLETED';
}

function toIncident(inc: IncidentRow) {
  const tasks = (Array.isArray(inc.tasks) ? inc.tasks : []) as IncidentTask[];
  const completed = tasks.filter((t) => t.status === 'COMPLETED').length;
  const progress = tasks.length ? Math.round((completed / tasks.length) * 100) : 0;
  const status = normalizeStatus(inc.status);
  const allRequiredDone = tasks.filter((t) => t.required).every((t) => t.status === 'COMPLETED');
  const rotateTask = tasks.find((t) => t.code === 'ROTATE_MASTER_PASSWORD');
  const timeline = (Array.isArray(inc.timeline) ? inc.timeline : []) as Array<{ eventType: string; title: string; detail?: string | null; createdAt: string }>;

  return {
    id: Number(inc.id),
    publicId: inc.public_id ?? `INC-${String(inc.id).padStart(6, '0')}`,
    type: inc.inc_type.toUpperCase(),
    status,
    planSnapshot: inc.plan_snapshot ?? 'FREE',
    safeDeviceName: inc.safe_device_name ?? 'Recovery Device',
    note: inc.note ?? null,
    progress,
    sessionsRevoked: Number(inc.revoked_sessions_count ?? 0),
    biometricsRevoked: Number(inc.revoked_biometrics_count ?? 0),
    startedAt: inc.started_at.toISOString(),
    completedAt: inc.completed_at ? inc.completed_at.toISOString() : inc.status === 'RESOLVED' ? (inc.resolved_at?.toISOString() ?? null) : null,
    cancelledAt: inc.cancelled_at ? inc.cancelled_at.toISOString() : null,
    canComplete: status === 'ACTIVE' && tasks.length > 0 && allRequiredDone,
    canCancel: status === 'ACTIVE' && rotateTask?.status !== 'COMPLETED',
    tasks,
    timeline,
  };
}

function defaultTasksFor(type: string, baseId: number): IncidentTask[] {
  const tasks: IncidentTask[] = [];
  let i = 0;
  const push = (partial: Partial<IncidentTask> & { code: string; title: string; detail: string }) => {
    tasks.push({
      id: baseId + i,
      code: partial.code,
      title: partial.title,
      detail: partial.detail,
      actionRoute: partial.actionRoute ?? null,
      required: partial.required ?? false,
      priority: partial.priority ?? i + 1,
      status: (partial.status ?? 'NOT_STARTED') as IncidentTask['status'],
      completedAt: partial.completedAt ?? null,
    });
    i++;
  };

  push({
    code: 'VERIFY_SAFE_DEVICE',
    title: 'Verify this safe device',
    detail: 'Guardian confirmed this device is the designated recovery session for this incident.',
    required: true,
    priority: 1,
    status: 'COMPLETED',
    completedAt: new Date().toISOString(),
  });
  push({
    code: 'REVOKE_OTHER_SESSIONS',
    title: 'Revoke other sessions',
    detail: 'Every other active session on this account was signed out when Lockdown started.',
    required: true,
    priority: 2,
    status: 'COMPLETED',
    completedAt: new Date().toISOString(),
  });
  push({
    code: 'REVOKE_BIOMETRICS',
    title: 'Revoke biometric sign-in',
    detail: 'Saved biometric credentials were removed when Lockdown started.',
    required: true,
    priority: 3,
    status: 'COMPLETED',
    completedAt: new Date().toISOString(),
  });
  push({
    code: 'ROTATE_MASTER_PASSWORD',
    title: 'Rotate master password',
    detail: 'Set a new master password that you have never used for any other account.',
    required: true,
    priority: 4,
    status: 'NOT_STARTED',
  });

  const t = type.toUpperCase();
  if (t === 'LOST_OR_STOLEN_DEVICE' || t === 'SIM_SWAP') {
    push({
      code: 'REVIEW_PHONE_ACCOUNT',
      title: 'Review phone account',
      detail: 'Check the carrier account for unauthorized SIM changes or port requests.',
      required: t === 'SIM_SWAP',
      priority: 5,
    });
  }
  if (t === 'EMAIL_COMPROMISED' || t === 'MASTER_PASSWORD_EXPOSED' || t === 'UNKNOWN_LOGIN') {
    push({
      code: 'SECURE_PRIMARY_EMAIL',
      title: 'Secure primary email',
      detail: 'Change the email password, sign out unknown sessions and review forwarding rules.',
      required: t === 'EMAIL_COMPROMISED',
      priority: 5,
      actionRoute: 'https://myaccount.google.com/security',
    });
  }
  if (t === 'MASTER_PASSWORD_EXPOSED' || t === 'PHISHING_ATTACK') {
    push({
      code: 'REVIEW_FINANCIAL_ACCOUNTS',
      title: 'Review financial accounts',
      detail: 'Review recent transactions and change passwords on any banking or payment account.',
      required: false,
      priority: 6,
    });
  }
  if (t === 'LOST_OR_STOLEN_DEVICE') {
    push({
      code: 'VAULT_ACCOUNT_DEVICE_PROVIDER',
      title: 'Review device account',
      detail: 'Sign out of the account on the lost device and check Find My Device protection.',
      required: false,
      priority: 5,
      actionRoute: null,
    });
  }
  push({
    code: 'VERIFY_RECOVERY_PATHS',
    title: 'Verify recovery paths',
    detail: 'Confirm your Recovery Kit, Recovery Circle and emergency contacts are still valid.',
    required: false,
    priority: 7,
  });

  return tasks;
}

function startTimeline(note: string | null, sessionsRevoked: number, biometricsRevoked: number, nowIso: string) {
  const events: Array<{ eventType: string; title: string; detail?: string | null; createdAt: string }> = [
    { eventType: 'INCIDENT_STARTED', title: 'Incident Lockdown started', detail: note ?? null, createdAt: nowIso },
  ];
  if (sessionsRevoked > 0) {
    events.push({ eventType: 'SESSIONS_REVOKED', title: 'Other sessions revoked', detail: `${sessionsRevoked} session(s) were signed out.`, createdAt: nowIso });
  }
  if (biometricsRevoked > 0) {
    events.push({ eventType: 'BIOMETRICS_REVOKED', title: 'Biometrics revoked', detail: `${biometricsRevoked} biometric credential(s) were removed.`, createdAt: nowIso });
  }
  return events;
}

router.get(
  '/incidents',
  requireAuth,
  asyncHandler(async (req: AuthedRequest, res: Response) => {
    const plan = await getPlanForUser(Number(req.userId));

    const active = await row<IncidentRow>(
      `SELECT id, public_id, inc_type, status, note, plan_snapshot, safe_device_name,
              revoked_sessions_count, revoked_biometrics_count, tasks, timeline,
              started_at, resolved_at, completed_at, cancelled_at
         FROM incidents
        WHERE user_id = $1 AND status = 'ACTIVE'
        ORDER BY started_at DESC LIMIT 1`,
      [req.userId]
    );

    const historyRows = await rows<IncidentRow>(
      `SELECT id, public_id, inc_type, status, note, plan_snapshot, safe_device_name,
              revoked_sessions_count, revoked_biometrics_count, tasks, timeline,
              started_at, resolved_at, completed_at, cancelled_at
         FROM incidents
        WHERE user_id = $1 AND status != 'ACTIVE'
        ORDER BY started_at DESC LIMIT 10`,
      [req.userId]
    );

    res.json({
      plan,
      eligible: plan !== 'FREE',
      canStart: plan !== 'FREE' && !active,
      message: active
        ? 'Incident Lockdown is active on this account.'
        : plan === 'FREE'
          ? 'Incident Lockdown is available on Premium and Family plans.'
          : 'Incident Lockdown is ready. Start it from a trusted device.',
      activeIncident: active ? toIncident(active) : null,
      history: historyRows.map(toIncident),
    });
  })
);

router.post(
  '/incidents/start',
  requireAuth,
  asyncHandler(async (req: AuthedRequest, res: Response) => {
    const plan = await getPlanForUser(Number(req.userId));
    if (plan === 'FREE') {
      throw new ApiError(403, 'Incident Lockdown is available on Premium and Family plans.', 'PLAN_LIMIT_REACHED');
    }

    const body = z
      .object({
        type: z.string().max(40).default('OTHER'),
        currentPassword: z.string().min(1).max(128),
        note: z.string().max(1000).optional(),
      })
      .parse(req.body);

    const user = await extractLoginUser(Number(req.userId));
    if (!user) throw notFound();
    if (!(await bcrypt.compare(body.currentPassword, user.password_hash))) {
      throw forbidden('Your current password is incorrect.');
    }

    const existing = await row<{ id: number }>(`SELECT id FROM incidents WHERE user_id = $1 AND status = 'ACTIVE'`, [req.userId]);
    if (existing) {
      throw conflict('An incident lockdown is already active on this account.');
    }

    const safeDeviceName = String(req.header('X-Guardian-Device-Name') || 'Recovery Device').slice(0, 80);
    const bioCount = await row<{ count: string }>(`SELECT COUNT(*)::int AS count FROM biometric_credentials WHERE user_id = $1`, [req.userId]);

    const created = await row<{ id: number }>(
      `INSERT INTO incidents (user_id, inc_type, status, tasks, note, plan_snapshot, safe_device_name, public_id, started_at, timeline)
       VALUES ($1, $2, 'ACTIVE', '[]', $3, $4, $5, $6, now(), '[]') RETURNING id`,
      [req.userId, body.type.toUpperCase(), body.note ?? null, plan, safeDeviceName, `INC-${Date.now().toString(36).toUpperCase()}`]
    );
    if (!created) throw new Error('Failed to create incident.');

    const baseId = Number(created.id) * 100;
    const tasks = defaultTasksFor(body.type, baseId);

    const sessionsResult = await query(
      `DELETE FROM sessions WHERE user_id = $1 AND id::text <> $2`,
      [req.userId, String(req.sessionId ?? '')]
    );
    await query(`DELETE FROM biometric_credentials WHERE user_id = $1`, [req.userId]);
    const sessionsRevoked = sessionsResult.rowCount ?? 0;
    const biometricsRevoked = Number(bioCount?.count ?? 0);

    const timeline = startTimeline(body.note ?? null, sessionsRevoked, biometricsRevoked, new Date().toISOString());

    await query(
      `UPDATE incidents SET tasks = $2::jsonb, revoked_sessions_count = $3, revoked_biometrics_count = $4, timeline = $5::jsonb WHERE id = $1`,
      [created.id, JSON.stringify(tasks), sessionsRevoked, biometricsRevoked, JSON.stringify(timeline)]
    );

    await createNotification({
      userId: Number(req.userId),
      type: 'INCIDENT',
      title: 'Incident lockdown active',
      body: body.note || 'An incident was reported on your account. Sensitive actions are frozen until resolved.',
      route: '/incidentlockdown',
    });

    const fresh = await incidentRowFor(Number(req.userId), created.id);
    res.status(201).json(fresh ? toIncident(fresh) : null);
  })
);

router.post(
  '/incidents/:id/cancel',
  requireAuth,
  asyncHandler(async (req: AuthedRequest, res: Response) => {
    const body = z.object({ currentPassword: z.string().min(1).max(128) }).parse(req.body);
    const user = await extractLoginUser(Number(req.userId));
    if (!user) throw notFound();
    if (!(await bcrypt.compare(body.currentPassword, user.password_hash))) {
      throw forbidden('Your current password is incorrect.');
    }

    const incident = await incidentRowFor(Number(req.userId), req.params.id);
    if (!incident) throw notFound('No active incident found.');
    if (incident.status !== 'ACTIVE') throw badRequest('This incident was already resolved.');

    const tasks = (Array.isArray(incident.tasks) ? incident.tasks : []) as IncidentTask[];
    if (tasks.find((t) => t.code === 'ROTATE_MASTER_PASSWORD')?.status === 'COMPLETED') {
      throw forbidden('This incident is past the point where it can be cancelled. Complete the remaining recovery steps instead.');
    }

    const timeline = (Array.isArray(incident.timeline) ? incident.timeline : []) as Array<{ eventType: string; title: string; detail?: string | null; createdAt: string }>;
    timeline.push({ eventType: 'INCIDENT_CANCELLED', title: 'Incident cancelled', detail: null, createdAt: new Date().toISOString() });

    await query(
      `UPDATE incidents SET status = 'CANCELLED', resolved_at = now(), cancelled_at = now(), timeline = $2::jsonb WHERE id = $1`,
      [incident.id, JSON.stringify(timeline)]
    );
    await query(`UPDATE duress_settings SET pending_alert_count = 0, incident_id = NULL WHERE user_id = $1`, [req.userId]);

    await createNotification({
      userId: Number(req.userId),
      type: 'INCIDENT',
      title: 'Incident cancelled',
      body: 'Your incident lockdown has been cancelled. Account access returned to normal.',
      route: '/home',
    });

    const fresh = await incidentRowFor(Number(req.userId), incident.id);
    res.json(fresh ? toIncident(fresh) : null);
  })
);

router.post(
  '/incidents/:id/rotate-password',
  requireAuth,
  asyncHandler(async (req: AuthedRequest, res: Response) => {
    const body = z
      .object({
        currentPassword: z.string().min(1).max(128),
        newPassword: z.string().min(10).max(128),
      })
      .parse(req.body);

    const incident = await incidentRowFor(Number(req.userId), req.params.id);
    if (!incident) throw notFound('No active incident found.');

    const user = await extractLoginUser(Number(req.userId));
    if (!user) throw notFound();
    if (!(await bcrypt.compare(body.currentPassword, user.password_hash))) {
      throw forbidden('Your current password is incorrect.');
    }

    const hash = await bcrypt.hash(body.newPassword, 12);
    await query(`UPDATE users SET password_hash = $2, password_changed_at = now(), updated_at = now() WHERE id = $1`, [user.id, hash]);

    const tasks = (Array.isArray(incident.tasks) ? incident.tasks : []) as IncidentTask[];
    const rotatedAt = new Date().toISOString();
    const updatedTasks = tasks.map((t) =>
      t.code === 'ROTATE_MASTER_PASSWORD' ? { ...t, status: 'COMPLETED' as const, completedAt: rotatedAt } : t
    );
    const timeline = (Array.isArray(incident.timeline) ? incident.timeline : []) as Array<{ eventType: string; title: string; detail?: string | null; createdAt: string }>;
    timeline.push({ eventType: 'PASSWORD_ROTATED', title: 'Master password rotated', detail: null, createdAt: rotatedAt });

    await query(`UPDATE incidents SET tasks = $2::jsonb, timeline = $3::jsonb WHERE id = $1`, [incident.id, JSON.stringify(updatedTasks), JSON.stringify(timeline)]);

    try {
      await sendGenericNotificationEmail(user.email, 'Password rotated after an incident', 'Your Guardian password was changed as part of the incident response. Use your new password to sign in from now on.');
    } catch (err) {
      console.error('[auth] rotate password email skipped', err);
    }

    const fresh = await incidentRowFor(Number(req.userId), incident.id);
    res.json(fresh ? toIncident(fresh) : null);
  })
);

router.post(
  '/incidents/:id/complete',
  requireAuth,
  asyncHandler(async (req: AuthedRequest, res: Response) => {
    const incident = await incidentRowFor(Number(req.userId), req.params.id);
    if (!incident) throw notFound('No active incident found.');
    if (incident.status !== 'ACTIVE') throw badRequest('This incident was already resolved.');

    const tasks = (Array.isArray(incident.tasks) ? incident.tasks : []) as IncidentTask[];
    const required = tasks.filter((t) => t.required);
    if (required.some((t) => t.status !== 'COMPLETED')) {
      throw forbidden('Complete all required recovery steps before completing Lockdown.');
    }

    const timeline = (Array.isArray(incident.timeline) ? incident.timeline : []) as Array<{ eventType: string; title: string; detail?: string | null; createdAt: string }>;
    timeline.push({ eventType: 'INCIDENT_COMPLETED', title: 'Incident resolved', detail: null, createdAt: new Date().toISOString() });

    await query(
      `UPDATE incidents SET status = 'RESOLVED', resolved_at = now(), completed_at = now(), timeline = $2::jsonb WHERE id = $1`,
      [incident.id, JSON.stringify(timeline)]
    );
    await query(`UPDATE duress_settings SET pending_alert_count = 0, incident_id = NULL WHERE user_id = $1`, [req.userId]);
    await query(`DELETE FROM sessions WHERE user_id = $1 AND mode = 'DURESS'`, [req.userId]);

    const fresh = await incidentRowFor(Number(req.userId), incident.id);
    res.json(fresh ? toIncident(fresh) : null);
  })
);

router.patch(
  '/incidents/:id/tasks/:taskId',
  requireAuth,
  asyncHandler(async (req: AuthedRequest, res: Response) => {
    const incident = await incidentRowFor(Number(req.userId), req.params.id);
    if (!incident) throw notFound('No active incident found.');

    const body = z
      .object({ status: z.enum(['NOT_STARTED', 'IN_PROGRESS', 'COMPLETED']) })
      .parse(req.body);

    const taskId = Number(req.params.taskId);
    const nowIso = new Date().toISOString();
    const tasks = (Array.isArray(incident.tasks) ? incident.tasks : []) as IncidentTask[];
    let target: IncidentTask | undefined;
    const updatedTasks = tasks.map((t) => {
      if (t.id !== taskId) return t;
      const next = { ...t, status: body.status };
      if (body.status === 'COMPLETED') next.completedAt = nowIso;
      else next.completedAt = null;
      target = next;
      return next;
    });
    if (!target) throw notFound('Task not found on this incident.');

    const timeline = (Array.isArray(incident.timeline) ? incident.timeline : []) as Array<{ eventType: string; title: string; detail?: string | null; createdAt: string }>;
    if (body.status === 'COMPLETED') {
      timeline.push({ eventType: 'TASK_COMPLETED', title: target.title, detail: null, createdAt: nowIso });
    }

    await query(`UPDATE incidents SET tasks = $2::jsonb, timeline = $3::jsonb WHERE id = $1`, [incident.id, JSON.stringify(updatedTasks), JSON.stringify(timeline)]);

    const fresh = await incidentRowFor(Number(req.userId), incident.id);
    res.json(fresh ? toIncident(fresh) : null);
  })
);

router.put(
  '/incidents/:id/tasks/:taskId',
  requireAuth,
  asyncHandler(async (req: AuthedRequest, res: Response) => {
    const incident = await incidentRowFor(Number(req.userId), req.params.id);
    if (!incident) throw notFound('No active incident found.');

    const body = z
      .object({ status: z.enum(['NOT_STARTED', 'IN_PROGRESS', 'COMPLETED']) })
      .parse(req.body);

    const taskId = Number(req.params.taskId);
    const nowIso = new Date().toISOString();
    const tasks = (Array.isArray(incident.tasks) ? incident.tasks : []) as IncidentTask[];
    let target: IncidentTask | undefined;
    const updatedTasks = tasks.map((t) => {
      if (t.id !== taskId) return t;
      const next = { ...t, status: body.status };
      if (body.status === 'COMPLETED') next.completedAt = nowIso;
      else next.completedAt = null;
      target = next;
      return next;
    });
    if (!target) throw notFound('Task not found on this incident.');

    const timeline = (Array.isArray(incident.timeline) ? incident.timeline : []) as Array<{ eventType: string; title: string; detail?: string | null; createdAt: string }>;
    if (body.status === 'COMPLETED') {
      timeline.push({ eventType: 'TASK_COMPLETED', title: target.title, detail: null, createdAt: nowIso });
    }

    await query(`UPDATE incidents SET tasks = $2::jsonb, timeline = $3::jsonb WHERE id = $1`, [incident.id, JSON.stringify(updatedTasks), JSON.stringify(timeline)]);

    const fresh = await incidentRowFor(Number(req.userId), incident.id);
    res.json(fresh ? toIncident(fresh) : null);
  })
);

/* ---------------------------------------------------------------------------
 * Email verification and password recovery
 * ------------------------------------------------------------------------ */

router.post(
  '/verify-email',
  codeLimiter,
  asyncHandler(async (req, res) => {
    const body = z.object({ email: emailSchema, code: codeSchema }).parse(req.body);
    const user = await findUserByEmail(body.email);
    if (!user) throw unauthorized('No account found for this email.');

    const ok = await consumeEmailCode(user.id, user.email, 'VERIFY_EMAIL', body.code);
    if (!ok) throw badRequest('That verification code is incorrect or has expired.');

    await query(`UPDATE users SET email_verified = true WHERE id = $1`, [user.id]);
    res.json({ message: 'Email verified.' });
  })
);

router.post(
  '/resend-verification',
  codeLimiter,
  asyncHandler(async (req, res) => {
    const body = z.object({ email: emailSchema }).parse(req.body);
    const user = await findUserByEmail(body.email);
    if (!user) throw notFound('No account found for this email.');

    const code = await storeEmailCode(user.id, user.email, 'VERIFY_EMAIL', env.CODE_EXPIRES_IN_MINUTES);
    await sendVerificationCodeEmail(user.email, code);
    res.json({ message: 'A new verification code was sent.' });
  })
);

router.post(
  '/forgot-password',
  authLimiter,
  asyncHandler(async (req, res) => {
    const body = z.object({ email: emailSchema }).parse(req.body);
    const user = await findUserByEmail(body.email);
    if (!user) {
      res.json({ message: 'If an account exists for that email, a reset code has been sent.' });
      return;
    }
    const code = await storeEmailCode(user.id, user.email, 'PASSWORD_RESET', env.CODE_EXPIRES_IN_MINUTES);
    await sendPasswordResetEmail(user.email, code);
    res.json({ message: 'If an account exists for that email, a reset code has been sent.' });
  })
);

router.post(
  '/reset-password',
  codeLimiter,
  asyncHandler(async (req, res) => {
    const body = z
      .object({ email: emailSchema, code: codeSchema, newPassword: passwordSchema })
      .parse(req.body);
    const user = await findUserByEmail(body.email);
    if (!user) throw unauthorized('No account found for this email.');

    const ok = await consumeEmailCode(user.id, user.email, 'PASSWORD_RESET', body.code);
    if (!ok) throw badRequest('That reset code is incorrect or has expired.');

    const hash = await bcrypt.hash(body.newPassword, 12);
    await query(
      `UPDATE users SET password_hash = $2, password_changed_at = now(), updated_at = now() WHERE id = $1`,
      [user.id, hash]
    );
    await query(`DELETE FROM biometric_credentials WHERE user_id = $1`, [user.id]);
    await query(`DELETE FROM sessions WHERE user_id = $1 AND mode = 'NORMAL'`, [user.id]);

    res.json({ message: 'Your password has been reset. Please sign in.' });
  })
);

/* ---------------------------------------------------------------------------
 * Legal consent
 * ------------------------------------------------------------------------ */

router.get(
  '/legal-consent',
  requireAuth,
  asyncHandler(async (req: AuthedRequest, res: Response) => {
    const version = String(req.query.version || '').trim();
    const consent = await row<{ version: string; privacy_accepted: boolean; terms_accepted: boolean; client_source: string | null; accepted_at: Date }>(
      `SELECT version, privacy_accepted, terms_accepted, client_source, accepted_at
         FROM legal_consents WHERE user_id = $1 AND version = $2`,
      [req.userId, version || '2026-07']
    );
    res.json({
      version: consent?.version ?? (version || '2026-07'),
      privacyAccepted: consent?.privacy_accepted ?? false,
      termsAccepted: consent?.terms_accepted ?? false,
      acceptedAt: consent?.accepted_at.toISOString() ?? null,
      clientSource: consent?.client_source ?? null,
    });
  })
);

router.post(
  '/legal-consent',
  requireAuth,
  asyncHandler(async (req: AuthedRequest, res: Response) => {
    const body = z
      .object({
        version: z.string().min(1).default('2026-07'),
        privacyAccepted: z.boolean().default(true),
        termsAccepted: z.boolean().default(true),
        clientSource: z.string().max(60).nullable().optional(),
      })
      .parse(req.body);

    await query(
      `INSERT INTO legal_consents (user_id, version, privacy_accepted, terms_accepted, client_source)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (user_id, version)
       DO UPDATE SET privacy_accepted = EXCLUDED.privacy_accepted,
                     terms_accepted = EXCLUDED.terms_accepted,
                     client_source = EXCLUDED.client_source,
                     accepted_at = now()`,
      [req.userId, body.version, body.privacyAccepted, body.termsAccepted, body.clientSource ?? null]
    );

    res.json({
      version: body.version,
      privacyAccepted: body.privacyAccepted,
      termsAccepted: body.termsAccepted,
      acceptedAt: new Date().toISOString(),
      clientSource: body.clientSource ?? null,
    });
  })
);

export default router;