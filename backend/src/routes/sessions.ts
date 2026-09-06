import { Router } from 'express';

import { asyncHandler, notFound } from '../lib/errors';
import { query, rows } from '../db/pool';
import { requireAuth, type AuthedRequest } from '../middleware/auth';

const router = Router({ mergeParams: true });

async function revokeSession(sessionId: string, by?: string): Promise<void> {
  await query(`UPDATE sessions SET revoked_at = now(), revoked_by = COALESCE($2, revoked_by) WHERE id = $1::uuid`, [sessionId, by ?? null]);
}

type SessionRow = {
  id: string;
  device_name: string;
  device_type: string;
  device_id: string;
  ip_address: string | null;
  user_id: number;
  last_active_at: Date;
  created_at: Date;
  revoked_at: Date | null;
};

function toDeviceSession(s: SessionRow, currentSessionId: string) {
  return {
    id: s.id,
    deviceName: s.device_name,
    deviceType: s.device_type,
    ipAddress: s.ip_address,
    active: !s.revoked_at,
    current: s.id === currentSessionId,
    createdAt: s.created_at.toISOString(),
    lastSeenAt: s.last_active_at.toISOString(),
    revokedAt: s.revoked_at ? s.revoked_at.toISOString() : null,
  };
}

router.get(
  '/',
  requireAuth,
  asyncHandler(async (req: AuthedRequest, res) => {
    const sessionRows = await rows<SessionRow>(
      `SELECT id, device_name, device_type, device_id, ip_address, last_active_at, created_at, revoked_at
         FROM sessions WHERE user_id = $1 AND revoked_at IS NULL
        ORDER BY last_active_at DESC`,
      [req.userId]
    );
    res.json(sessionRows.map((s) => toDeviceSession(s, String(req.sessionId))));
  })
);

router.get(
  '/heartbeat',
  requireAuth,
  asyncHandler(async (req: AuthedRequest, res) => {
    await query(`UPDATE sessions SET last_active_at = now() WHERE id = $1`, [req.sessionId]);
    res.json({ active: true, message: 'Session is active.' });
  })
);

router.delete(
  '/:id',
  requireAuth,
  asyncHandler(async (req: AuthedRequest, res) => {
    const target = String(req.params.id);
    if (target === String(req.sessionId)) {
      await revokeSession(String(req.sessionId), 'current');
      return res.json({ message: 'Current session ended.' });
    }
    const deleted = await query(`DELETE FROM sessions WHERE id = $1::uuid AND user_id = $2`, [target, req.userId]);
    if ((deleted.rowCount ?? 0) === 0) throw notFound('No session found.');
    res.json({ message: 'Device session revoked.' });
  })
);

router.post(
  '/logout-others',
  requireAuth,
  asyncHandler(async (req: AuthedRequest, res) => {
    const revoked = await query(
      `UPDATE sessions SET revoked_at = now(), revoked_by = 'other' WHERE user_id = $1 AND id <> $2 AND revoked_at IS NULL`,
      [req.userId, req.sessionId]
    );
    res.json({ message: 'Other devices logged out.', revokedCount: revoked.rowCount ?? 0 });
  })
);

router.post(
  '/logout-all',
  requireAuth,
  asyncHandler(async (req: AuthedRequest, res) => {
    const revoked = await query(
      `UPDATE sessions SET revoked_at = now(), revoked_by = 'all' WHERE user_id = $1 AND revoked_at IS NULL`,
      [req.userId]
    );
    await revokeSession(String(req.sessionId), 'all');
    res.json({ message: 'All devices logged out.', revokedCount: revoked.rowCount ?? 0 });
  })
);

export default router;