"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const errors_1 = require("../lib/errors");
const pool_1 = require("../db/pool");
const auth_1 = require("../middleware/auth");
const plan_1 = require("../lib/plan");
const codes_1 = require("../lib/codes");
const notifications_1 = require("../services/notifications");
const router = (0, express_1.Router)({ mergeParams: true });
const CHECKS_DEFINITION = [
    { code: 'RECOVERY_KIT', title: 'Recovery kit configured', weight: 25, actionRoute: '/recoverykit' },
    { code: 'TWO_FACTOR', title: 'Two-factor authentication', weight: 25, actionRoute: '/securityhealth' },
    { code: 'BACKUP', title: 'Cloud backup', weight: 20, actionRoute: '/backup' },
    { code: 'PASSWORD_STRENGTH', title: 'Strong master password', weight: 15, actionRoute: '/securityhealth' },
    { code: 'EMERGENCY_CONTACTS', title: 'Emergency contacts', weight: 15, actionRoute: '/emergencyaccess' },
];
async function checksForUser(userId) {
    const [kit, twoFA, backup, passwordCount, contactCount] = await Promise.all([
        (0, pool_1.row)('SELECT recovery_kit_id FROM users WHERE id = $1', [userId]),
        (0, pool_1.row)('SELECT two_factor_enabled FROM users WHERE id = $1', [userId]),
        (0, pool_1.row)('SELECT COUNT(*)::int AS count FROM backup_files WHERE user_id = $1', [userId]),
        (0, pool_1.row)('SELECT COUNT(*)::int AS count FROM vault_passwords WHERE user_id = $1', [userId]),
        (0, pool_1.row)('SELECT COUNT(*)::int AS count FROM emergency_contacts WHERE user_id = $1', [userId]),
    ]);
    return {
        recoveryKit: Boolean(kit?.recovery_kit_id),
        twoFactor: Boolean(twoFA?.two_factor_enabled),
        backup: Number(backup?.count ?? 0) > 0,
        vaultSize: `${Number(passwordCount?.count ?? 0)} passwords in your vault`,
        contacts: Number(contactCount?.count ?? 0) > 0,
    };
}
async function toDrill(d) {
    const members = await (0, pool_1.rows)(`SELECT * FROM continuity_responses WHERE drill_id = $1`, [d.id]);
    const participantCount = members.length;
    const acknowledgedCount = members.filter((r) => r.status === 'ACKNOWLEDGED').length;
    const participants = await Promise.all(members.map(async (r) => {
        const u = await (0, pool_1.row)('SELECT id, full_name FROM users WHERE email = $1', [r.participant_email]);
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
    }));
    const health = await checksForUser(Number(d.user_id));
    const checks = CHECKS_DEFINITION.map((c) => {
        const ok = (c.code === 'RECOVERY_KIT' && health.recoveryKit) ||
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
router.get('/', auth_1.requireAuth, (0, errors_1.asyncHandler)(async (req, res) => {
    if (req.sessionMode === 'DURESS') {
        return res.json({ plan: 'FREE', eligible: false, canRun: false, message: 'Unavailable in this session.', activeDrill: null, history: [], receivedRequests: [] });
    }
    const plan = await (0, plan_1.getPlanForUser)(Number(req.userId));
    const eligible = plan === 'FAMILY';
    const active = await (0, pool_1.row)(`SELECT * FROM continuity_drills WHERE user_id = $1 AND status = 'RUNNING' ORDER BY created_at DESC LIMIT 1`, [req.userId]);
    const history = await (0, pool_1.rows)(`SELECT * FROM continuity_drills WHERE user_id = $1 AND status <> 'RUNNING' ORDER BY created_at DESC LIMIT 5`, [req.userId]);
    const me = await (0, pool_1.row)('SELECT email FROM users WHERE id = $1', [req.userId]);
    const receivedRaw = await (0, pool_1.rows)(`SELECT cr.* FROM continuity_responses cr WHERE cr.participant_email = $1`, [me.email]);
    const receivedRequests = await Promise.all(receivedRaw.map(async (cr) => {
        const drill = await (0, pool_1.row)('SELECT * FROM continuity_drills WHERE id = $1', [cr.drill_id]);
        const owner = drill ? await (0, pool_1.row)('SELECT full_name, email FROM users WHERE id = $1', [drill.user_id]) : null;
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
    }));
    res.json({
        plan,
        eligible,
        canRun: eligible,
        message: eligible ? 'Continuity drills ready.' : 'Continuity drills are available on the Family plan.',
        activeDrill: active ? await toDrill(active) : null,
        history: await Promise.all(history.map(toDrill)),
        receivedRequests,
    });
}));
router.post('/start', auth_1.requireAuth, (0, errors_1.asyncHandler)(async (req, res) => {
    if (req.sessionMode === 'DURESS')
        throw (0, errors_1.forbidden)('Not available in this session.');
    const plan = await (0, plan_1.getPlanForUser)(Number(req.userId));
    if (plan !== 'FAMILY')
        throw new errors_1.ApiError(403, 'Continuity drills are available on the Family plan.', 'PLAN_LIMIT_REACHED');
    const active = await (0, pool_1.row)(`SELECT * FROM continuity_drills WHERE user_id = $1 AND status = 'RUNNING'`, [req.userId]);
    if (active)
        throw (0, errors_1.forbidden)('A continuity drill is already running.');
    const publicId = `CD-${(0, codes_1.randomToken)(8)}`;
    const drill = await (0, pool_1.row)(`INSERT INTO continuity_drills (public_id, user_id, status, drill_type)
       VALUES ($1, $2, 'RUNNING', 'FAMILY')
       RETURNING *`, [publicId, req.userId]);
    const members = await (0, pool_1.query)(`SELECT member_user_id, member_email FROM family_memberships WHERE owner_user_id = $1`, [req.userId]);
    for (const m of members.rows) {
        if (m.member_user_id) {
            await (0, pool_1.query)(`INSERT INTO continuity_responses (drill_id, public_id, participant_email, status)
           VALUES ($1, $2, $3, 'PENDING')`, [drill.id, `CDR-${(0, codes_1.randomToken)(8)}`, m.member_email]);
            await (0, notifications_1.createNotification)({
                userId: Number(m.member_user_id),
                type: 'CONTINUITY',
                title: 'Continuity drill in progress',
                body: 'A family continuity drill has started. Acknowledge it when you are asked.',
                route: '/continuitydrill',
            });
        }
    }
    res.status(201).json(await toDrill(drill));
}));
router.post('/:id/cancel', auth_1.requireAuth, (0, errors_1.asyncHandler)(async (req, res) => {
    const drill = await (0, pool_1.row)(`SELECT * FROM continuity_drills WHERE id = $1 AND user_id = $2`, [req.params.id, req.userId]);
    if (!drill)
        throw (0, errors_1.notFound)();
    const updated = await (0, pool_1.row)(`UPDATE continuity_drills SET status = 'CANCELLED', cancelled_at = now() WHERE id = $1 RETURNING *`, [drill.id]);
    res.json(await toDrill(updated));
}));
router.post('/:id/complete', auth_1.requireAuth, (0, errors_1.asyncHandler)(async (req, res) => {
    const drill = await (0, pool_1.row)(`SELECT * FROM continuity_drills WHERE id = $1 AND user_id = $2`, [req.params.id, req.userId]);
    if (!drill)
        throw (0, errors_1.notFound)();
    const updated = await (0, pool_1.row)(`UPDATE continuity_drills SET status = 'COMPLETED', completed_at = now() WHERE id = $1 RETURNING *`, [drill.id]);
    res.json(await toDrill(updated));
}));
router.post('/requests/:publicId/acknowledge', (0, errors_1.asyncHandler)(async (req, res) => {
    const response = await (0, pool_1.row)(`SELECT * FROM continuity_responses WHERE public_id = $1`, [req.params.publicId]);
    if (!response)
        throw (0, errors_1.notFound)('No continuity drill request found.');
    if (response.status === 'ACKNOWLEDGED') {
        res.json({ publicId: response.public_id, status: 'ACKNOWLEDGED', acknowledgedAt: response.acknowledged_at?.toISOString() ?? null, message: 'Already acknowledged.' });
        return;
    }
    const updated = await (0, pool_1.row)(`UPDATE continuity_responses SET status = 'ACKNOWLEDGED', acknowledged_at = now() WHERE id = $1 RETURNING *`, [response.id]);
    res.json({ publicId: updated.public_id, status: 'ACKNOWLEDGED', acknowledgedAt: updated.acknowledged_at?.toISOString() ?? null, message: 'Acknowledged. The owner can complete the drill.' });
}));
exports.default = router;
//# sourceMappingURL=continuity.js.map