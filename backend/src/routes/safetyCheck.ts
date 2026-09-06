import { Router } from 'express';
import { z } from 'zod';

import { asyncHandler, ApiError } from '../lib/errors';
import { query, row, rows } from '../db/pool';
import { requireAuth, type AuthedRequest } from '../middleware/auth';
import { getPlanForUser } from '../lib/plan';

const router = Router({ mergeParams: true });

type SafetyRow = {
  id: number;
  status: string;
  started_at: Date;
};

type SettingsRow = {
  id: number;
  contact_id: number | null;
  interval_days: number;
  grace_period_hours: number;
  enabled: boolean;
  last_check_in_at: Date | null;
  updated_at: Date;
};

async function settingsFor(userId: number): Promise<SettingsRow | null> {
  return row<SettingsRow>(
    `SELECT id, contact_id, interval_days, grace_period_hours, enabled, last_check_in_at, updated_at
       FROM safety_check_settings WHERE user_id = $1`,
    [userId]
  );
}

async function payload(userId: number, plan: string) {
  const settings = await settingsFor(userId);
  const active = await row<SafetyRow>(
    `SELECT id, status, started_at FROM safety_checks
      WHERE user_id = $1 AND status IN ('ACTIVE', 'GRACE')
      ORDER BY started_at DESC LIMIT 1`,
    [userId]
  );

  const contacts = await rows<{ id: number; name: string; email: string | null; relationship: string | null }>(
    `SELECT id, name, email, relationship FROM emergency_contacts WHERE user_id = $1 AND email IS NOT NULL`,
    [userId]
  );

  const configured = Boolean(settings?.enabled);
  const contact = settings?.contact_id
    ? await row<{ id: number; name: string; email: string }>('SELECT id, name, email FROM emergency_contacts WHERE id = $1', [settings.contact_id])
    : null;

  const intervalMs = (settings?.interval_days ?? 7) * 24 * 60 * 60_000;

  return {
    plan,
    eligible: plan !== 'FREE',
    canConfigure: plan !== 'FREE',
    configured,
    enabled: configured,
    status: active?.status ?? 'DISABLED',
    contactId: contact?.id ?? settings?.contact_id ?? null,
    contactName: contact?.name ?? null,
    contactEmail: contact?.email ?? null,
    intervalDays: settings?.interval_days ?? null,
    gracePeriodHours: settings?.grace_period_hours ?? null,
    lastCheckInAt: settings?.last_check_in_at?.toISOString() ?? null,
    nextCheckInAt: settings?.last_check_in_at
      ? new Date(settings.last_check_in_at.getTime() + intervalMs).toISOString()
      : null,
    graceStartedAt: active?.status === 'GRACE' ? active.started_at.toISOString() : null,
    triggeredAt: active?.status === 'TRIGGERED' ? active.started_at.toISOString() : null,
    triggeredRequestId: null,
    contacts: contacts.map((c) => ({
      id: Number(c.id),
      name: c.name,
      email: c.email ?? '',
      relationship: c.relationship ?? '',
      registered: true,
      active: true,
      hasSharedItems: false,
    })),
    message: active?.status === 'ACTIVE' ? 'Guardian Safety Check is active.' : 'Guardian Safety Check is configured and listening.',
  };
}

router.get(
  '/',
  requireAuth,
  asyncHandler(async (req: AuthedRequest, res) => {
    if (req.sessionMode === 'DURESS') {
      res.json({ plan: 'FREE', eligible: false, canConfigure: false, configured: false, enabled: false, status: 'DISABLED', contacts: [], message: 'Unavailable in this session.' });
      return;
    }
    const plan = await getPlanForUser(Number(req.userId));
    res.json(await payload(Number(req.userId), plan));
  })
);

const configure = asyncHandler(async (req: AuthedRequest, res) => {
    if (req.sessionMode === 'DURESS') {
      throw new ApiError(403, 'Not available in this session.', 'FORBIDDEN');
    }
    const plan = await getPlanForUser(Number(req.userId));
    if (plan === 'FREE') {
      throw new ApiError(403, 'Guardian Safety Check is available on Premium and Family plans.', 'PLAN_LIMIT_REACHED');
    }

    const body = z
      .object({
        enabled: z.boolean(),
        contactId: z.number().int().positive().nullable().optional(),
        intervalDays: z.number().int().min(1).max(90).nullable().optional(),
        gracePeriodHours: z.number().int().min(1).max(168).nullable().optional(),
      })
      .parse(req.body);

    if (body.enabled && !body.contactId) {
      throw new ApiError(400, 'Choose a trusted contact to be notified on check-in timeout.', 'BAD_REQUEST');
    }

    const existing = await settingsFor(Number(req.userId));
    if (existing) {
      await query(
        `UPDATE safety_check_settings SET
            enabled = $2,
            contact_id = COALESCE($3, contact_id),
            interval_days = COALESCE($4, interval_days),
            grace_period_hours = COALESCE($5, grace_period_hours),
            updated_at = now()
          WHERE user_id = $1`,
        [req.userId, body.enabled, body.contactId ?? null, body.intervalDays ?? null, body.gracePeriodHours ?? null]
      );
    } else {
      await query(
        `INSERT INTO safety_check_settings (user_id, contact_id, interval_days, grace_period_hours, enabled)
         VALUES ($1, $2, $3, $4, $5)`,
        [req.userId, body.contactId ?? null, body.intervalDays ?? 7, body.gracePeriodHours ?? 24, body.enabled]
      );
    }

    if (body.enabled) {
      const active = await row<SafetyRow>(
        `SELECT id, status, started_at FROM safety_checks
          WHERE user_id = $1 AND status = 'ACTIVE' ORDER BY started_at DESC LIMIT 1`,
        [req.userId]
      );
      if (!active) {
        await query(
          `INSERT INTO safety_checks (user_id, status, duration_minutes, started_at, expires_at, check_in_marker)
           VALUES ($1, 'ACTIVE', $2, now(), now() + ($3 || ' days')::interval, $4)`,
          [req.userId, (body.intervalDays ?? 7) * 24 * 60, body.intervalDays ?? 7, `ok-${req.userId}-${Date.now()}`]
        );
      }
    } else {
      await query(
        `UPDATE safety_checks SET status = 'TRIGGERED', result = 'disabled' WHERE user_id = $1 AND status IN ('ACTIVE', 'GRACE')`,
        [req.userId]
      );
    }

    res.json(await payload(Number(req.userId), plan));
  });

router.put('/', requireAuth, configure);
router.post('/', requireAuth, configure);

router.post(
  '/check-in',
  requireAuth,
  asyncHandler(async (req: AuthedRequest, res) => {
    const plan = await getPlanForUser(Number(req.userId));
    if (req.sessionMode === 'DURESS') {
      throw new ApiError(403, 'Not available in this session.', 'FORBIDDEN');
    }
    const settings = await settingsFor(Number(req.userId));
    if (!settings || !settings.enabled) {
      res.json(await payload(Number(req.userId), plan));
      return;
    }

    await query(`UPDATE safety_check_settings SET last_check_in_at = now(), updated_at = now() WHERE user_id = $1`, [req.userId]);
    await query(`DELETE FROM safety_checks WHERE user_id = $1 AND status IN ('ACTIVE', 'GRACE')`, [req.userId]);

    const days = settings.interval_days || 7;
    await query(
      `INSERT INTO safety_checks (user_id, status, duration_minutes, started_at, expires_at, check_in_marker)
       VALUES ($1, 'ACTIVE', $2, now(), now() + ($3 || ' days')::interval, $4)`,
      [req.userId, days * 24 * 60, days, `ok-${req.userId}-${Date.now()}`]
    );

    res.json(await payload(Number(req.userId), plan));
  })
);

export default router;