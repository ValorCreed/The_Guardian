import { Router } from 'express';
import { z } from 'zod';

import { asyncHandler, notFound } from '../lib/errors';
import { query, row, rows } from '../db/pool';
import { requireAuth, type AuthedRequest } from '../middleware/auth';
import { upsertPushToken } from '../lib/pusher';
import { deletePushToken } from '../lib/pusher';

const router = Router({ mergeParams: true });

type NotificationRow = {
  id: number;
  type: string;
  title: string;
  body: string;
  route: string | null;
  read: boolean;
  created_at: Date;
};

function toNotification(n: NotificationRow) {
  return {
    id: Number(n.id),
    type: n.type,
    title: n.title,
    message: n.body,
    actionRoute: n.route,
    read: n.read,
    createdAt: n.created_at.toISOString(),
  };
}

router.get(
  '/',
  requireAuth,
  asyncHandler(async (req: AuthedRequest, res) => {
    const items = await rows<NotificationRow>(
      `SELECT * FROM notifications WHERE user_id = $1 ORDER BY created_at DESC LIMIT 50`,
      [req.userId]
    );
    res.json(items.map(toNotification));
  })
);

router.get(
  '/unread-count',
  requireAuth,
  asyncHandler(async (req: AuthedRequest, res) => {
    const r = await row<{ count: string }>('SELECT COUNT(*)::int AS count FROM notifications WHERE user_id = $1 AND read = false', [req.userId]);
    res.json({ unreadCount: Number(r?.count ?? 0) });
  })
);

router.put(
  '/:id/read',
  requireAuth,
  asyncHandler(async (req: AuthedRequest, res) => {
    const n = await row<NotificationRow>(
      `UPDATE notifications SET read = true WHERE id = $1 AND user_id = $2 RETURNING *`,
      [req.params.id, req.userId]
    );
    if (!n) throw notFound('No notification found.');
    res.json(toNotification(n));
  })
);

router.put(
  '/read-all',
  requireAuth,
  asyncHandler(async (req: AuthedRequest, res) => {
    await query(`UPDATE notifications SET read = true WHERE user_id = $1`, [req.userId]);
    res.status(204).send();
  })
);

router.delete(
  '/:id',
  requireAuth,
  asyncHandler(async (req: AuthedRequest, res) => {
    const deleted = await query(`DELETE FROM notifications WHERE id = $1 AND user_id = $2`, [req.params.id, req.userId]);
    if ((deleted.rowCount ?? 0) === 0) throw notFound('No notification found.');
    res.status(204).send();
  })
);

const pushTokenSchema = z.object({
  installationId: z.string().min(1),
  expoPushToken: z.string().min(1),
  platform: z.enum(['android', 'ios']),
  deviceName: z.string().min(1).max(120),
  appVersion: z.string().max(60).nullable().optional(),
});

router.put(
  '/push-token',
  requireAuth,
  asyncHandler(async (req: AuthedRequest, res) => {
    const body = pushTokenSchema.parse(req.body);
    await upsertPushToken(
      Number(req.userId),
      body.installationId,
      body.expoPushToken,
      body.platform,
      body.deviceName,
      body.appVersion ?? null
    );
    res.json({
      registered: true,
      installationId: body.installationId,
      platform: body.platform,
      deviceName: body.deviceName,
      lastSeenAt: new Date().toISOString(),
    });
  })
);

router.delete(
  '/push-token/:installationId',
  requireAuth,
  asyncHandler(async (req: AuthedRequest, res) => {
    await deletePushToken(Number(req.userId), req.params.installationId);
    res.status(204).send();
  })
);

const DEFAULT_PREFERENCES = {
  pushEnabled: true,
  securityAlerts: true,
  emergencyRecovery: true,
  continuityReminders: true,
  billing: true,
  productUpdates: true,
};

type Prefs = typeof DEFAULT_PREFERENCES;

async function loadPrefs(userId: number): Promise<Prefs> {
  const r = await row<{ prefs: unknown }>('SELECT prefs FROM notification_preferences WHERE user_id = $1', [userId]);
  const stored = (r?.prefs ?? {}) as Record<string, boolean>;
  const merged = { ...DEFAULT_PREFERENCES };
  for (const key of Object.keys(merged) as Array<keyof Prefs>) {
    if (typeof stored[key as string] === 'boolean') merged[key] = stored[key as string];
  }
  return merged;
}

router.get(
  '/preferences',
  requireAuth,
  asyncHandler(async (req: AuthedRequest, res) => {
    res.json(await loadPrefs(Number(req.userId)));
  })
);

router.put(
  '/preferences',
  requireAuth,
  asyncHandler(async (req: AuthedRequest, res) => {
    const body = z
      .object({
        pushEnabled: z.boolean().optional(),
        securityAlerts: z.boolean().optional(),
        emergencyRecovery: z.boolean().optional(),
        continuityReminders: z.boolean().optional(),
        billing: z.boolean().optional(),
        productUpdates: z.boolean().optional(),
      })
      .parse(req.body);

    const merged = { ...(await loadPrefs(Number(req.userId))), ...body };
    await query(
      `INSERT INTO notification_preferences (user_id, prefs, updated_at)
       VALUES ($1, $2, now())
       ON CONFLICT (user_id) DO UPDATE SET prefs = EXCLUDED.prefs, updated_at = now()`,
      [req.userId, JSON.stringify(merged)]
    );
    res.json(merged);
  })
);

export default router;