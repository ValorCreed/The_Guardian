import { Router } from 'express';
import { z } from 'zod';

import { asyncHandler } from '../lib/errors';
import { query } from '../db/pool';
import { requireAuth, type AuthedRequest } from '../middleware/auth';
import { createNotification } from '../services/notifications';

const router = Router({ mergeParams: true });

const bodySchema = z.object({
  score: z.number().min(0).max(100),
  totalIssues: z.number().int().nonnegative(),
  breachedCount: z.number().int().nonnegative(),
  weakCount: z.number().int().nonnegative(),
  reusedCount: z.number().int().nonnegative(),
  oldCount: z.number().int().nonnegative(),
});

router.post(
  '/scan',
  requireAuth,
  asyncHandler(async (req: AuthedRequest, res) => {
    const body = bodySchema.parse(req.body);

    await query(
      `INSERT INTO security_alerts (user_id, alert_type, severity, title, message)
       VALUES ($1, 'SECURITY_SCAN_ALERT', $2, $3, $4)`,
      [
        req.userId,
        body.score < 60 ? 'high' : body.score < 80 ? 'medium' : 'low',
        `Security scan complete: ${body.score}/100`,
        `${body.totalIssues} issue(s) found (${body.breachedCount} breached, ${body.weakCount} weak, ${body.reusedCount} reused, ${body.oldCount} old).`,
      ]
    );

    if (body.breachedCount > 0 || body.totalIssues > 0) {
      await createNotification({
        userId: Number(req.userId),
        type: 'SECURITY_SCAN_ALERT',
        title: 'Security issues detected',
        body: `Your last security scan found ${body.totalIssues} issue(s). Review your security health.`,
        route: '/securityhealth',
      });
    }

    res.json({ message: 'Security scan reported.' });
  })
);

export default router;