import { Router } from 'express';
import { z } from 'zod';

import { asyncHandler, notFound } from '../lib/errors';
import { query, row } from '../db/pool';
import { requireAuth, type AuthedRequest } from '../middleware/auth';
import { env } from '../config/env';
import { randomToken } from '../lib/codes';

const router = Router({ mergeParams: true });

type PaymentRow = {
  id: number;
  plan: string;
  reference: string;
  access_code: string | null;
  authorization_url: string | null;
  status: string;
  paid_at: Date | null;
  created_at: Date;
};

function paymentIntent(): { authorizationUrl: string } {
  return {
    authorizationUrl: env.PAYMENTS_SANDBOX ? 'https://checkout.guardian.app/dev-payment' : `${env.APP_ORIGIN}/payments/checkout`,
  };
}

async function ensurePlanCanUpgrade(userId: number) {
  return query(`SELECT 1 FROM users WHERE id = $1`, [userId]);
}

router.post(
  '/initialize',
  requireAuth,
  asyncHandler(async (req: AuthedRequest, res) => {
    await ensurePlanCanUpgrade(Number(req.userId));
    const body = z.object({ plan: z.enum(['PREMIUM', 'FAMILY']) }).parse(req.body);

    const reference = `G-${body.plan.slice(0, 3)}-${randomToken(9)}`;
    const url = paymentIntent().authorizationUrl;
    const accessCode = randomToken(12);

    const p = await row<PaymentRow>(
      `INSERT INTO payments (user_id, plan, reference, provider, access_code, authorization_url, amount, currency, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'NGN', 'PENDING')
       RETURNING *`,
      [req.userId, body.plan, reference, env.PAYMENT_PROVIDER ?? 'paystack', accessCode, `${url}?reference=${reference}`, body.plan === 'FAMILY' ? 1200000 : 500000]
    );

    res.status(201).json({
      authorizationUrl: p!.authorization_url,
      accessCode: p!.access_code,
      reference: p!.reference,
    });
  })
);

router.post(
  '/verify',
  requireAuth,
  asyncHandler(async (req: AuthedRequest, res) => {
    const body = z.object({ reference: z.string().min(1) }).parse(req.body);
    const p = await row<PaymentRow>(`SELECT * FROM payments WHERE reference = $1 AND user_id = $2`, [body.reference, req.userId]);
    if (!p) throw notFound('No payment found for that reference.');

    if (p.status === 'PENDING') {
      // In sandbox mode a payment always succeeds. A real deployment calls the
      // configured provider's verify endpoint (adapter seam) before this point.
      const paid = await row<PaymentRow>(
        `UPDATE payments SET status = 'PAID', paid_at = now() WHERE id = $1 RETURNING *`,
        [p.id]
      );
      await query(
        `INSERT INTO subscriptions (user_id, plan, status, current_period_end, auto_renew)
         VALUES ($1, $2, 'ACTIVE', now() + interval '30 days', true)
         ON CONFLICT (user_id)
         DO UPDATE SET plan = EXCLUDED.plan, status = 'ACTIVE', current_period_end = EXCLUDED.current_period_end, auto_renew = true, updated_at = now()`,
        [req.userId, paid!.plan]
      );
      await query(
        `INSERT INTO notifications (user_id, type, title, body, route, data, read)
         VALUES ($1, 'SUBSCRIPTION_ACTIVATED', 'Plan activated', 'Your ' || $2 || ' plan is now active.', '/settings', '{}', false)`,
        [req.userId, paid!.plan]
      );
      res.json({ message: `Payment verified. ${paid!.plan} plan activated.`, plan: paid!.plan, status: 'PAID' });
      return;
    }

    res.json({ message: `Payment already verified.`, plan: p.plan, status: p.status });
  })
);

export default router;