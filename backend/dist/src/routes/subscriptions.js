"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const errors_1 = require("../lib/errors");
const pool_1 = require("../db/pool");
const auth_1 = require("../middleware/auth");
const env_1 = require("../config/env");
const router = (0, express_1.Router)({ mergeParams: true });
function toSubscription(s) {
    return {
        plan: s.plan,
        active: s.status === 'ACTIVE',
        startedAt: s.created_at.toISOString(),
        expiresAt: s.current_period_end ? s.current_period_end.toISOString() : null,
    };
}
async function currentSubscription(userId) {
    const s = await (0, pool_1.row)(`SELECT plan, status, current_period_end, created_at FROM subscriptions WHERE user_id = $1`, [userId]);
    if (s)
        return s;
    return { plan: 'FREE', status: 'ACTIVE', current_period_end: null, created_at: new Date() };
}
async function setPlan(userId, plan) {
    const s = await (0, pool_1.row)(`INSERT INTO subscriptions (user_id, plan, status, current_period_end, auto_renew)
     VALUES ($1, $2, 'ACTIVE', now() + interval '30 days', true)
     ON CONFLICT (user_id)
     DO UPDATE SET plan = EXCLUDED.plan, status = 'ACTIVE', current_period_end = EXCLUDED.current_period_end, auto_renew = true, updated_at = now()
     RETURNING plan, status, current_period_end, created_at`, [userId, plan]);
    return s;
}
router.get('/me', auth_1.requireAuth, (0, errors_1.asyncHandler)(async (req, res) => {
    res.json(toSubscription(await currentSubscription(Number(req.userId))));
}));
router.post('/upgrade', auth_1.requireAuth, (0, errors_1.asyncHandler)(async (req, res) => {
    const plan = String(req.query.plan ?? '').toUpperCase();
    if (plan !== 'PREMIUM' && plan !== 'FAMILY') {
        throw new errors_1.ApiError(400, 'Invalid plan.', 'BAD_REQUEST');
    }
    // Real deployments gate upgrades on a paid & verified payment intent.
    // Payments stay configurable (PAYMENTS_SANDBOX=true by default), so the
    // sandbox path grants the plan directly after a choice.
    const rows = await (0, pool_1.row)(`SELECT status FROM payments WHERE user_id = $1 AND plan = $2 AND status = 'PAID' ORDER BY paid_at DESC LIMIT 1`, [req.userId, plan]);
    if (!env_1.env.PAYMENTS_SANDBOX && !rows) {
        throw new errors_1.ApiError(402, 'Complete payment before upgrading.', 'PAYMENT_REQUIRED');
    }
    res.json(toSubscription(await setPlan(Number(req.userId), plan)));
}));
router.post('/cancel', auth_1.requireAuth, (0, errors_1.asyncHandler)(async (req, res) => {
    const current = await currentSubscription(Number(req.userId));
    if (current.plan === 'FREE') {
        res.json(toSubscription(current));
        return;
    }
    const s = await (0, pool_1.row)(`UPDATE subscriptions SET plan = 'FREE', status = 'CANCELLED', auto_renew = false, updated_at = now()
        WHERE user_id = $1
        RETURNING plan, status, current_period_end, created_at`, [req.userId]);
    await (0, pool_1.query)(`INSERT INTO notifications (user_id, type, title, body, route, data, read)
      VALUES ($1, 'SUBSCRIPTION_CANCELLED', 'Subscription cancelled', 'Your premium features will be unavailable once the period ends.', '/settings', '{}', false)`, [req.userId]);
    res.json(toSubscription(s));
}));
exports.default = router;
//# sourceMappingURL=subscriptions.js.map