import { Router } from 'express';

import { asyncHandler, notFound, forbidden, ApiError } from '../lib/errors';
import { query, row, rows } from '../db/pool';
import { requireAuth, type AuthedRequest } from '../middleware/auth';
import { getPlanForUser } from '../lib/plan';
import { randomToken } from '../lib/codes';
import { createNotification } from '../services/notifications';

const router = Router({ mergeParams: true });

const CHECKS_DEFINITION = [
  { code: 'RECOVERY_KIT', title: 'Recovery kit configured', weight: 25, actionRoute: '/recoverykit' },
  { code: 'TWO_FACTOR', title: 'Two-factor authentication', weight: 25, actionRoute: '/securityhealth' },
  { code: 'BACKUP', title: 'Cloud backup', weight: 20, actionRoute: '/backup' },
  { code: 'PASSWORD_STRENGTH', title: 'Strong master password', weight: 15, actionRoute: '/securityhealth' },
  { code: 'EMERGENCY_CONTACTS', title: 'Emergency contacts', weight: 15, actionRoute: '/emergencyaccess' },
] as const;

type DrillRow = {
  id: number;
  public_id: string;
  user_id: number;
  status: string;
  drill_type: string | null;
  scheduled_at: Date;
  completed_at: Date | null;
  cancelled_at: Date | null;
  created_at: Date;
};

type ResponseRow = {
  id: number;
  drill_id: number;
  public_id: string;
  participant_email: string;
  status: string;
  acknowledged_at: Date | null;
  created_at: Date;
};

async function checksForUser(userId: number) {
  const [kit, twoFA, backup, passwordCount, contactCount] = await Promise.all([
    row<{ recovery_kit_id: string | null }>('SELECT recovery_kit_id FROM users WHERE id = $1', [userId]),
    row<{ two_factor_enabled: boolean }>('SELECT two_factor_enabled FROM users WHERE id = $1', [userId]),
    row<{ count: string }>('SELECT COUNT(*)::int AS count FROM backup_files WHERE user_id = $1', [userId]),
    row<{ count: string }>('SELECT COUNT(*)::int AS count FROM vault_passwords WHERE user_id = $1', [userId]),
    row<{ count: string }>('SELECT COUNT(*)::int AS count FROM emergency_contacts WHERE user_id = $1', [userId]),
  ]);

  return {
    recoveryKit: Boolean(kit?.recovery_kit_id),
    twoFactor: Boolean(twoFA?.two_factor_enabled),
    backup: Number(backup?.count ?? 0) > 0,
    vaultSize: `${Number(passwordCount?.count ?? 0)} passwords in your vault`,
    contacts: Number(contactCount?.count ?? 0) > 0,
  };
}

async function toDrill(d: DrillRow) {
  const members = await rows<ResponseRow>(
    `SELECT * FROM continuity_responses WHERE drill_id = $1`,
    [d.id]
  );
  const participantCount = members.length;
  const acknowledgedCount = members.filter((r) => r.status === 'ACKNOWLEDGED').length;
  const participants = await Promise.all(
    members.map(async (r) => {
      const u = await row<{ id: number; full_name: string }>('SELECT id, full_name FROM users WHERE email = $1', [r.participant_email]);
      return {
        userId: u?.id ?? null,
        name: u?.full_name ?? r.participant_email.split('@')[0],
        email: r.participant_email,
        roles: 'family',
        status: r.status,
        eligible: true,
        notifiedAt: r.created_at.toISOString(),
        acknowledgedAt: r.acknowledged_at ? r.acknowledged_at.toISOString() : null,
      };
    })
  );

  const health = await checksForUser(Number(d.user_id));
  const checks = CHECKS_DEFINITION.map((c) => {
    const ok =
      (c.code === 'RECOVERY_KIT' && health.recoveryKit) ||
      (c.code === 'TWO_FACTOR' && health.twoFactor) ||
      (c.code === 'BACKUP' && health.backup) ||
      (c.code === 'PASSWORD_STRENGTH' && Number(health.vaultSize.split(' ')[0]) >= 1) ||
      (c.code === 'EMERGENCY_CONTACTS' && health.contacts);
    return {
      code: c.code,
      title: c.title,
      status: ok ? 'PASS' : 'FAIL',
      detail: ok ? 'All good.' : 'Needs attention.',
      actionRoute: c.actionRoute,
      weight: c.weight,
      earnedPoints: ok ? c.weight : 0,
    };
  });

  const score = d.status === 'RUNNING'
    ? checks.reduce((sum, c) => sum + (c.status === 'PASS' ? c.earnedPoints : 0), 0)
    : Math.min(100, checks.reduce((sum, c) => sum + (c.status === 'PASS' ? c.earnedPoints : 0), 0));

  const canComplete = participantCount > 0 && acknowledgedCount === participantCount;

  return {
    id: Number(d.id),
    publicId: d.public_id,
    status: d.status,
    score,
    staticScore: score,
    acknowledgedCount,
    participantCount,
    startedAt: d.created_at.toISOString(),
    expiresAt: new Date(d.created_at.getTime() + 24 * 60 * 60_000).toISOString(),
    completedAt: d.completed_at ? d.completed_at.toISOString() : null,
    cancelledAt: d.cancelled_at ? d.cancelled_at.toISOString() : null,
    canComplete,
    canCancel: d.status === 'RUNNING',
    checks,
    participants,
  };
}

router.get(
  '/',
  requireAuth,
  asyncHandler(async (req: AuthedRequest, res) => {
    if (req.sessionMode === 'DURESS') {
      return res.json({ plan: 'FREE', eligible: false, canRun: false, message: 'Unavailable in this session.', activeDrill: null, history: [], receivedRequests: [] });
    }
    const plan = await getPlanForUser(Number(req.userId));
    const eligible = plan === 'FAMILY';

    const active = await row<DrillRow>(
      `SELECT * FROM continuity_drills WHERE user_id = $1 AND status = 'RUNNING' ORDER BY created_at DESC LIMIT 1`,
      [req.userId]
    );
    const history = await rows<DrillRow>(
      `SELECT * FROM continuity_drills WHERE user_id = $1 AND status <> 'RUNNING' ORDER BY created_at DESC LIMIT 5`,
      [req.userId]
    );

    const me = await row<{ email: string }>('SELECT email FROM users WHERE id = $1', [req.userId]);
    const receivedRaw = await rows<ResponseRow>(
      `SELECT cr.* FROM continuity_responses cr WHERE cr.participant_email = $1`,
      [me!.email]
    );

    const receivedRequests = await Promise.all(
      receivedRaw.map(async (cr) => {
        const drill = await row<DrillRow>('SELECT * FROM continuity_drills WHERE id = $1', [cr.drill_id]);
        const owner = drill ? await row<{ full_name: string; email: string }>('SELECT full_name, email FROM users WHERE id = $1', [drill.user_id]) : null;
        return {
          publicId: cr.public_id,
          ownerName: owner?.full_name ?? '',
          ownerEmail: owner?.email ?? '',
          roles: 'family',
          status: cr.status,
          startedAt: drill ? drill.created_at.toISOString() : '',
          expiresAt: drill ? new Date(drill.created_at.getTime() + 24 * 60 * 60_000).toISOString() : '',
          acknowledgedAt: cr.acknowledged_at ? cr.acknowledged_at.toISOString() : null,
          canAcknowledge: cr.status === 'PENDING',
        };
      })
    );

    res.json({
      plan,
      eligible,
      canRun: eligible,
      message: eligible ? 'Continuity drills ready.' : 'Continuity drills are available on the Family plan.',
      activeDrill: active ? await toDrill(active) : null,
      history: await Promise.all(history.map(toDrill)),
      receivedRequests,
    });
  })
);

router.post(
  '/start',
  requireAuth,
  asyncHandler(async (req: AuthedRequest, res) => {
    if (req.sessionMode === 'DURESS') throw forbidden('Not available in this session.');
    const plan = await getPlanForUser(Number(req.userId));
    if (plan !== 'FAMILY') throw new ApiError(403, 'Continuity drills are available on the Family plan.', 'PLAN_LIMIT_REACHED');

    const active = await row<DrillRow>(`SELECT * FROM continuity_drills WHERE user_id = $1 AND status = 'RUNNING'`, [req.userId]);
    if (active) throw forbidden('A continuity drill is already running.');

    const publicId = `CD-${randomToken(8)}`;
    const drill = await row<DrillRow>(
      `INSERT INTO continuity_drills (public_id, user_id, status, drill_type)
       VALUES ($1, $2, 'RUNNING', 'FAMILY')
       RETURNING *`,
      [publicId, req.userId]
    );

    const members = await query<{ member_user_id: number | null; member_email: string }>(
      `SELECT member_user_id, member_email FROM family_memberships WHERE owner_user_id = $1`,
      [req.userId]
    );

    for (const m of members.rows) {
      if (m.member_user_id) {
        await query(
          `INSERT INTO continuity_responses (drill_id, public_id, participant_email, status)
           VALUES ($1, $2, $3, 'PENDING')`,
          [drill!.id, `CDR-${randomToken(8)}`, m.member_email]
        );
        await createNotification({
          userId: Number(m.member_user_id),
          type: 'CONTINUITY',
          title: 'Continuity drill in progress',
          body: 'A family continuity drill has started. Acknowledge it when you are asked.',
          route: '/continuitydrill',
        });
      }
    }

    res.status(201).json(await toDrill(drill!));
  })
);

router.post('/:id/cancel', requireAuth, asyncHandler(async (req: AuthedRequest, res) => {
  const drill = await row<DrillRow>(`SELECT * FROM continuity_drills WHERE id = $1 AND user_id = $2`, [req.params.id, req.userId]);
  if (!drill) throw notFound();
  const updated = await row<DrillRow>(`UPDATE continuity_drills SET status = 'CANCELLED', cancelled_at = now() WHERE id = $1 RETURNING *`, [drill.id]);
  res.json(await toDrill(updated!));
}));

router.post('/:id/complete', requireAuth, asyncHandler(async (req: AuthedRequest, res) => {
  const drill = await row<DrillRow>(`SELECT * FROM continuity_drills WHERE id = $1 AND user_id = $2`, [req.params.id, req.userId]);
  if (!drill) throw notFound();
  const updated = await row<DrillRow>(`UPDATE continuity_drills SET status = 'COMPLETED', completed_at = now() WHERE id = $1 RETURNING *`, [drill.id]);
  res.json(await toDrill(updated!));
}));

router.post('/requests/:publicId/acknowledge', asyncHandler(async (req, res) => {
  const response = await row<ResponseRow>(
    `SELECT * FROM continuity_responses WHERE public_id = $1`,
    [req.params.publicId]
  );
  if (!response) throw notFound('No continuity drill request found.');
  if (response.status === 'ACKNOWLEDGED') {
    res.json({ publicId: response.public_id, status: 'ACKNOWLEDGED', acknowledgedAt: response.acknowledged_at?.toISOString() ?? null, message: 'Already acknowledged.' });
    return;
  }
  const updated = await row<ResponseRow>(
    `UPDATE continuity_responses SET status = 'ACKNOWLEDGED', acknowledged_at = now() WHERE id = $1 RETURNING *`,
    [response.id]
  );
  res.json({ publicId: updated!.public_id, status: 'ACKNOWLEDGED', acknowledgedAt: updated!.acknowledged_at?.toISOString() ?? null, message: 'Acknowledged. The owner can complete the drill.' });
}));

export default router;