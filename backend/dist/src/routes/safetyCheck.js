"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const zod_1 = require("zod");
const errors_1 = require("../lib/errors");
const pool_1 = require("../db/pool");
const auth_1 = require("../middleware/auth");
const plan_1 = require("../lib/plan");
const router = (0, express_1.Router)({ mergeParams: true });
async function settingsFor(userId) {
    return (0, pool_1.row)(`SELECT id, contact_id, interval_days, grace_period_hours, enabled, last_check_in_at, updated_at
       FROM safety_check_settings WHERE user_id = $1`, [userId]);
}
async function payload(userId, plan) {
    const settings = await settingsFor(userId);
    const active = await (0, pool_1.row)(`SELECT id, status, started_at FROM safety_checks
      WHERE user_id = $1 AND status IN ('ACTIVE', 'GRACE')
      ORDER BY started_at DESC LIMIT 1`, [userId]);
    const contacts = await (0, pool_1.rows)(`SELECT id, name, email, relationship FROM emergency_contacts WHERE user_id = $1 AND email IS NOT NULL`, [userId]);
    const configured = Boolean(settings?.enabled);
    const contact = settings?.contact_id
        ? await (0, pool_1.row)('SELECT id, name, email FROM emergency_contacts WHERE id = $1', [settings.contact_id])
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
router.get('/', auth_1.requireAuth, (0, errors_1.asyncHandler)(async (req, res) => {
    if (req.sessionMode === 'DURESS') {
        res.json({ plan: 'FREE', eligible: false, canConfigure: false, configured: false, enabled: false, status: 'DISABLED', contacts: [], message: 'Unavailable in this session.' });
        return;
    }
    const plan = await (0, plan_1.getPlanForUser)(Number(req.userId));
    res.json(await payload(Number(req.userId), plan));
}));
const configure = (0, errors_1.asyncHandler)(async (req, res) => {
    if (req.sessionMode === 'DURESS') {
        throw new errors_1.ApiError(403, 'Not available in this session.', 'FORBIDDEN');
    }
    const plan = await (0, plan_1.getPlanForUser)(Number(req.userId));
    if (plan === 'FREE') {
        throw new errors_1.ApiError(403, 'Guardian Safety Check is available on Premium and Family plans.', 'PLAN_LIMIT_REACHED');
    }
    const body = zod_1.z
        .object({
        enabled: zod_1.z.boolean(),
        contactId: zod_1.z.number().int().positive().nullable().optional(),
        intervalDays: zod_1.z.number().int().min(1).max(90).nullable().optional(),
        gracePeriodHours: zod_1.z.number().int().min(1).max(168).nullable().optional(),
    })
        .parse(req.body);
    if (body.enabled && !body.contactId) {
        throw new errors_1.ApiError(400, 'Choose a trusted contact to be notified on check-in timeout.', 'BAD_REQUEST');
    }
    const existing = await settingsFor(Number(req.userId));
    if (existing) {
        await (0, pool_1.query)(`UPDATE safety_check_settings SET
            enabled = $2,
            contact_id = COALESCE($3, contact_id),
            interval_days = COALESCE($4, interval_days),
            grace_period_hours = COALESCE($5, grace_period_hours),
            updated_at = now()
          WHERE user_id = $1`, [req.userId, body.enabled, body.contactId ?? null, body.intervalDays ?? null, body.gracePeriodHours ?? null]);
    }
    else {
        await (0, pool_1.query)(`INSERT INTO safety_check_settings (user_id, contact_id, interval_days, grace_period_hours, enabled)
         VALUES ($1, $2, $3, $4, $5)`, [req.userId, body.contactId ?? null, body.intervalDays ?? 7, body.gracePeriodHours ?? 24, body.enabled]);
    }
    if (body.enabled) {
        const active = await (0, pool_1.row)(`SELECT id, status, started_at FROM safety_checks
          WHERE user_id = $1 AND status = 'ACTIVE' ORDER BY started_at DESC LIMIT 1`, [req.userId]);
        if (!active) {
            await (0, pool_1.query)(`INSERT INTO safety_checks (user_id, status, duration_minutes, started_at, expires_at, check_in_marker)
           VALUES ($1, 'ACTIVE', $2, now(), now() + ($3 || ' days')::interval, $4)`, [req.userId, (body.intervalDays ?? 7) * 24 * 60, body.intervalDays ?? 7, `ok-${req.userId}-${Date.now()}`]);
        }
    }
    else {
        await (0, pool_1.query)(`UPDATE safety_checks SET status = 'TRIGGERED', result = 'disabled' WHERE user_id = $1 AND status IN ('ACTIVE', 'GRACE')`, [req.userId]);
    }
    res.json(await payload(Number(req.userId), plan));
});
router.put('/', auth_1.requireAuth, configure);
router.post('/', auth_1.requireAuth, configure);
router.post('/check-in', auth_1.requireAuth, (0, errors_1.asyncHandler)(async (req, res) => {
    const plan = await (0, plan_1.getPlanForUser)(Number(req.userId));
    if (req.sessionMode === 'DURESS') {
        throw new errors_1.ApiError(403, 'Not available in this session.', 'FORBIDDEN');
    }
    const settings = await settingsFor(Number(req.userId));
    if (!settings || !settings.enabled) {
        res.json(await payload(Number(req.userId), plan));
        return;
    }
    await (0, pool_1.query)(`UPDATE safety_check_settings SET last_check_in_at = now(), updated_at = now() WHERE user_id = $1`, [req.userId]);
    await (0, pool_1.query)(`DELETE FROM safety_checks WHERE user_id = $1 AND status IN ('ACTIVE', 'GRACE')`, [req.userId]);
    const days = settings.interval_days || 7;
    await (0, pool_1.query)(`INSERT INTO safety_checks (user_id, status, duration_minutes, started_at, expires_at, check_in_marker)
       VALUES ($1, 'ACTIVE', $2, now(), now() + ($3 || ' days')::interval, $4)`, [req.userId, days * 24 * 60, days, `ok-${req.userId}-${Date.now()}`]);
    res.json(await payload(Number(req.userId), plan));
}));
exports.default = router;
//# sourceMappingURL=safetyCheck.js.map