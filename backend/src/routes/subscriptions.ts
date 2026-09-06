import { Router } from 'express';

import { asyncHandler, ApiError } from '../lib/errors';
import { query, row } from '../db/pool';
import { requireAuth, type AuthedRequest } from '../middleware/auth';
import { env } from '../config/env';

const router = Router({ mergeParams: true });

type SubscriptionRow = {
  plan: string;
  status: string;
  current_period_end: Date | null;
  created_at: Date;
};

function toSubscription(s: SubscriptionRow) {
  return {
    plan: s.plan as 'FREE' | 'PREMIUM' | 'FAMILY',
    active: s.status === 'ACTIVE',
    startedAt: s.created_at.toISOString(),
    expiresAt: s.current_period_end ? s.current_period_end.toISOString() : null,
  };
}

async function currentSubscription(userId: number): Promise<SubscriptionRow> {
  const s = await row<SubscriptionRow>(
    `SELECT plan, status, current_period_end, created_at FROM subscriptions WHERE user_id = $1`,
    [userId]
  );
  if (s) return s;
  return { plan: 'FREE', status: 'ACTIVE', current_period_end: null, created_at: new Date() };
}

async function setPlan(userId: number, plan: string): Promise<SubscriptionRow> {
  const s = await row<SubscriptionRow>(
    `INSERT INTO subscriptions (user_id, plan, status, current_period_end, auto_renew)
     VALUES ($1, $2, 'ACTIVE', now() + interval '30 days', true)
     ON CONFLICT (user_id)
     DO UPDATE SET plan = EXCLUDED.plan, status = 'ACTIVE', current_period_end = EXCLUDED.current_period_end, auto_renew = true, updated_at = now()
     RETURNING plan, status, current_period_end, created_at`,
    [userId, plan]
  );
  return s!;
}

router.get(
  '/me',
  requireAuth,
  asyncHandler(async (req: AuthedRequest, res) => {
    res.json(toSubscription(await currentSubscription(Number(req.userId))));
  })
);

router.post(
  '/upgrade',
  requireAuth,
  asyncHandler(async (req: AuthedRequest, res) => {
    const plan = String(req.query.plan ?? '').toUpperCase();
    if (plan !== 'PREMIUM' && plan !== 'FAMILY') {
      throw new ApiError(400, 'Invalid plan.', 'BAD_REQUEST');
    }

    // Real deployments gate upgrades on a paid & verified payment intent.
    // Payments stay configurable (PAYMENTS_SANDBOX=true by default), so the
    // sandbox path grants the plan directly after a choice.
    const rows = await row<{ status: string }>(
      `SELECT status FROM payments WHERE user_id = $1 AND plan = $2 AND status = 'PAID' ORDER BY paid_at DESC LIMIT 1`,
      [req.userId, plan]
    );
    if (!env.PAYMENTS_SANDBOX && !rows) {
      throw new ApiError(402, 'Complete payment before upgrading.', 'PAYMENT_REQUIRED');
    }

    res.json(toSubscription(await setPlan(Number(req.userId), plan)));
  })
);

router.post(
  '/cancel',
  requireAuth,
  asyncHandler(async (req: AuthedRequest, res) => {
    const current = await currentSubscription(Number(req.userId));
    if (current.plan === 'FREE') {
      res.json(toSubscription(current));
      return;
    }
    const s = await row<SubscriptionRow>(
      `UPDATE subscriptions SET plan = 'FREE', status = 'CANCELLED', auto_renew = false, updated_at = now()
        WHERE user_id = $1
        RETURNING plan, status, current_period_end, created_at`,
      [req.userId]
    );
    await query(`INSERT INTO notifications (user_id, type, title, body, route, data, read)
      VALUES ($1, 'SUBSCRIPTION_CANCELLED', 'Subscription cancelled', 'Your premium features will be unavailable once the period ends.', '/settings', '{}', false)`, [req.userId]);
    res.json(toSubscription(s!));
  })
);

export default router;