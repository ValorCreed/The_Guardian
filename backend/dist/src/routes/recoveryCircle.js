"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const zod_1 = require("zod");
const uuid_1 = require("uuid");
const errors_1 = require("../lib/errors");
const pool_1 = require("../db/pool");
const crypto_1 = require("../lib/crypto");
const codes_1 = require("../lib/codes");
const auth_1 = require("../middleware/auth");
const plan_1 = require("../lib/plan");
const notifications_1 = require("../services/notifications");
const router = (0, express_1.Router)({ mergeParams: true });
function parseVotes(value) {
    if (!Array.isArray(value))
        return [];
    return value.map((v) => v).filter((v) => v && v.userId && v.decision);
}
async function userEmail(id) {
    const u = await (0, pool_1.row)('SELECT email FROM users WHERE id = $1', [id]);
    return u?.email ?? '';
}
async function toRequestRow(req, circle, viewerId) {
    const votes = parseVotes(req.votes);
    const approvalCount = votes.filter((v) => v.decision === 'APPROVED').length;
    const denialCount = votes.filter((v) => v.decision === 'DENIED').length;
    const isExpired = req.expires_at.getTime() < Date.now();
    const owner = await (0, pool_1.row)('SELECT full_name, email FROM users WHERE id = $1', [req.owner_user_id]);
    let status = req.status;
    if ((status === 'PENDING') && isExpired)
        status = 'EXPIRED';
    if (status === 'PENDING' && approvalCount >= req.threshold)
        status = 'APPROVED';
    if (status === 'PENDING' && denialCount > circle.memberIds.length - req.threshold)
        status = 'DENIED';
    const viewer = Number(viewerId ?? 0);
    const isOwner = Number(req.owner_user_id) === viewer;
    const viewerVote = votes.find((v) => Number(v.userId) === viewer);
    const isMember = circle.memberIds.some((m) => Number(m) === viewer);
    return {
        requestId: req.id,
        ownerName: owner?.full_name ?? null,
        ownerEmail: owner?.email ?? null,
        status,
        approvalCount,
        denialCount,
        threshold: req.threshold,
        memberCount: req.member_count,
        createdAt: req.created_at.toISOString(),
        expiresAt: req.expires_at.toISOString(),
        approvedAt: status === 'APPROVED' ? new Date().toISOString() : null,
        completedAt: status === 'COMPLETED' && req.decided_at ? req.decided_at.toISOString() : null,
        canVote: status === 'PENDING' && isMember && !isOwner && !viewerVote,
        currentUserDecision: viewerVote?.decision ?? null,
    };
}
async function candidateRowsFor(userId) {
    return (0, pool_1.rows)(`SELECT c.id AS contact_id, u.id AS user_id, c.name, c.email, c.relationship
       FROM emergency_contacts c
       LEFT JOIN users u ON u.email = c.email AND u.email IS NOT NULL
      WHERE c.user_id = $1 AND c.email IS NOT NULL
      ORDER BY c.name`, [userId]);
}
function toCandidates(rowsData) {
    return rowsData
        .filter((c) => c.user_id != null)
        .map((c) => ({
        contactId: Number(c.contact_id),
        userId: Number(c.user_id),
        name: c.name,
        email: c.email,
        relationship: c.relationship ?? '',
    }));
}
async function circleConfig(userId) {
    const u = await (0, pool_1.row)('SELECT recovery_circle FROM users WHERE id = $1', [userId]);
    const cfg = (u?.recovery_circle ?? {});
    return {
        enabled: Boolean(cfg.enabled),
        threshold: Number(cfg.threshold ?? 2),
        memberIds: Array.isArray(cfg.memberIds) ? cfg.memberIds.map(Number) : [],
        codeHash: cfg.codeHash ?? null,
    };
}
async function memberRowsFor(userId) {
    return (0, pool_1.rows)(`SELECT * FROM recovery_circle_members WHERE owner_user_id = $1 ORDER BY created_at`, [userId]);
}
router.get('/', auth_1.requireAuth, (0, errors_1.asyncHandler)(async (req, res) => {
    if (req.sessionMode === 'DURESS') {
        return res.json({ plan: 'FREE', eligible: false, canConfigure: false, configured: false, enabled: false, threshold: 0, members: [], candidates: [], ownedRequests: [], approvalRequests: [], recoveryCode: null, message: 'Unavailable in this session.' });
    }
    const plan = await (0, plan_1.getPlanForUser)(Number(req.userId));
    const eligible = plan === 'PREMIUM' || plan === 'FAMILY';
    const circle = await circleConfig(Number(req.userId));
    const members = await memberRowsFor(Number(req.userId));
    const candidatesData = await candidateRowsFor(Number(req.userId));
    const candidates = toCandidates(candidatesData);
    const ownedRequests = await (0, pool_1.rows)(`SELECT * FROM recovery_requests WHERE owner_user_id = $1 ORDER BY created_at DESC LIMIT 5`, [req.userId]);
    const approvalRequests = await (0, pool_1.rows)(`SELECT rr.*
         FROM recovery_requests rr
        WHERE rr.owner_user_id = ANY(
                (SELECT COALESCE(array_agg(m.owner_user_id), ARRAY[]::bigint[])
                   FROM recovery_circle_members m
                  WHERE m.member_user_id = $1)::bigint[]
              )
        ORDER BY rr.created_at DESC LIMIT 5`, [req.userId]);
    const viewer = Number(req.userId);
    res.json({
        plan,
        eligible,
        canConfigure: eligible,
        configured: members.length > 0 && circle.enabled,
        enabled: circle.enabled,
        threshold: circle.threshold,
        members: members.map((m) => ({ id: Number(m.id), userId: Number(m.member_user_id ?? m.id), name: m.member_email.split('@')[0], email: m.member_email })),
        candidates,
        ownedRequests: await Promise.all(ownedRequests.map((r) => toRequestRow(r, circle, viewer))),
        approvalRequests: await Promise.all(approvalRequests.map((r) => toRequestRow(r, circle, viewer))),
        recoveryCode: null,
        message: eligible && circle.enabled ? 'Recovery circle is configured.' : 'Recovery circle is not configured yet.',
    });
}));
router.put('/', auth_1.requireAuth, (0, errors_1.asyncHandler)(async (req, res) => {
    if (req.sessionMode === 'DURESS')
        throw (0, errors_1.forbidden)('Not available in this session.');
    const plan = await (0, plan_1.getPlanForUser)(Number(req.userId));
    if (plan === 'FREE') {
        throw new errors_1.ApiError(403, 'Recovery circle is available on Premium and Family plans.', 'PLAN_LIMIT_REACHED');
    }
    const body = zod_1.z
        .object({
        enabled: zod_1.z.boolean(),
        threshold: zod_1.z.number().int().min(1).max(10).optional().default(2),
        memberUserIds: zod_1.z.array(zod_1.z.number().int().positive()).optional().default([]),
        password: zod_1.z.string().min(1).max(128),
    })
        .parse(req.body);
    const user = await (0, pool_1.row)('SELECT password_hash FROM users WHERE id = $1', [req.userId]);
    if (!(await bcryptjs_1.default.compare(body.password, user.password_hash))) {
        throw (0, errors_1.forbidden)('Your current password is incorrect.');
    }
    const memberIds = [...new Set(body.memberUserIds)];
    let recoveryCodePlain = null;
    let codeHash = null;
    if (body.enabled) {
        recoveryCodePlain = `GRC-${(0, codes_1.randomToken)()}`;
        codeHash = (0, crypto_1.sha256Hex)(recoveryCodePlain);
    }
    await (0, pool_1.query)(`UPDATE users SET recovery_circle = $2::jsonb, updated_at = now() WHERE id = $1`, [req.userId, JSON.stringify({ enabled: body.enabled, threshold: body.threshold, memberIds, codeHash })]);
    await (0, pool_1.query)(`DELETE FROM recovery_circle_members WHERE owner_user_id = $1`, [req.userId]);
    for (const id of memberIds) {
        const email = await userEmail(id);
        const member = await (0, pool_1.row)('SELECT id FROM users WHERE id = $1', [id]);
        if (member && email) {
            await (0, pool_1.query)(`INSERT INTO recovery_circle_members (owner_user_id, member_email, member_user_id, status)
           VALUES ($1, $2, $3, 'ACTIVE') ON CONFLICT DO NOTHING`, [req.userId, email, id]);
        }
    }
    if (body.enabled) {
        await (0, notifications_1.createNotification)({
            userId: Number(req.userId),
            type: 'RECOVERY_CIRCLE',
            title: 'Recovery circle configured',
            body: `Your recovery circle is ready with a threshold of ${body.threshold}.`,
            route: '/recoverycircle',
        });
    }
    res.json(await (async () => {
        const members = await memberRowsFor(Number(req.userId));
        const candidatesData = await candidateRowsFor(Number(req.userId));
        const candidates = toCandidates(candidatesData);
        return {
            plan,
            eligible: true,
            canConfigure: true,
            configured: true,
            enabled: body.enabled,
            threshold: body.threshold,
            members: members.map((m) => ({ id: Number(m.id), userId: Number(m.member_user_id ?? m.id), name: m.member_email.split('@')[0], email: m.member_email })),
            candidates,
            ownedRequests: [],
            approvalRequests: [],
            recoveryCode: body.enabled ? recoveryCodePlain : null,
            message: body.enabled ? 'Recovery circle configured.' : 'Recovery circle disabled.',
        };
    })());
}));
/* ----- Recovery requests ----- */
router.post('/recovery/start', (0, errors_1.asyncHandler)(async (req, res) => {
    const body = zod_1.z
        .object({ email: zod_1.z.string().trim().toLowerCase().email(), recoveryCode: zod_1.z.string().min(1).max(80) })
        .parse(req.body);
    const owner = await (0, pool_1.row)('SELECT id, recovery_circle FROM users WHERE email = $1', [body.email]);
    if (!owner)
        throw (0, errors_1.notFound)('No account found for that email.');
    const cfg = (owner.recovery_circle ?? {});
    if (!cfg.enabled)
        throw (0, errors_1.forbidden)('That account does not have recovery circle enabled.');
    if (!(0, codes_1.safeEqual)(cfg.codeHash ?? '', (0, crypto_1.sha256Hex)(body.recoveryCode))) {
        throw (0, errors_1.badRequest)('The recovery code is incorrect.');
    }
    const memberIds = cfg.memberIds ?? [];
    const members = await (0, pool_1.rows)(`SELECT member_user_id FROM recovery_circle_members WHERE owner_user_id = $1`, [owner.id]);
    const requestId = (0, uuid_1.v4)();
    const expiresAt = new Date(Date.now() + 24 * 60 * 60_000);
    await (0, pool_1.query)(`INSERT INTO recovery_requests (id, owner_user_id, requester_email, requester_user_id, recovery_code_hash, threshold, member_count, votes, expires_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, '[]', $8)`, [requestId, owner.id, body.email, owner.id, (0, crypto_1.sha256Hex)(`REQ-${memberIds.join(',')}`), cfg.threshold ?? 2, members.length, expiresAt]);
    for (const m of members) {
        if (m.member_user_id) {
            await (0, notifications_1.createNotification)({
                userId: Number(m.member_user_id),
                type: 'RECOVERY_CIRCLE',
                title: 'Recovery circle request',
                body: 'An owner in your recovery circle is requesting account recovery. Approve or deny it.',
                route: '/recoverycircle',
            });
        }
    }
    res.status(201).json({
        requestId,
        threshold: cfg.threshold ?? 2,
        expiresAt: expiresAt.toISOString(),
        message: 'Recovery started. Share the request ID with your circle to gather approvals.',
    });
}));
async function loadRequest(requestId) {
    const r = await (0, pool_1.row)('SELECT * FROM recovery_requests WHERE id = $1', [requestId]);
    if (!r)
        throw (0, errors_1.notFound)('Recovery request not found.');
    return r;
}
router.post('/recovery/status', (0, errors_1.asyncHandler)(async (req, res) => {
    const body = zod_1.z.object({ requestId: zod_1.z.string().min(1), recoveryCode: zod_1.z.string().min(1).max(80) }).parse(req.body);
    const r = await loadRequest(body.requestId.trim().toUpperCase());
    const owner = await (0, pool_1.row)('SELECT recovery_circle FROM users WHERE id = $1', [r.owner_user_id]);
    const cfg = (owner?.recovery_circle ?? {});
    if (!(0, codes_1.safeEqual)(cfg.codeHash ?? '', (0, crypto_1.sha256Hex)(body.recoveryCode))) {
        throw (0, errors_1.badRequest)('The recovery code is incorrect.');
    }
    const votes = parseVotes(r.votes);
    const approvalCount = votes.filter((v) => v.decision === 'APPROVED').length;
    const status = r.expires_at.getTime() < Date.now() ? 'EXPIRED' : r.status;
    res.json({
        status,
        approvalCount,
        threshold: r.threshold,
        expiresAt: r.expires_at.toISOString(),
        canComplete: status === 'PENDING' && approvalCount >= r.threshold,
        message: status === 'PENDING' && approvalCount >= r.threshold
            ? 'Threshold reached. You can complete recovery.'
            : `${approvalCount}/${r.threshold} approvals gathered so far.`,
    });
}));
router.post('/recovery/complete', (0, errors_1.asyncHandler)(async (req, res) => {
    const body = zod_1.z
        .object({ requestId: zod_1.z.string().min(1), recoveryCode: zod_1.z.string().min(1).max(80), newPassword: zod_1.z.string().min(8).max(128) })
        .parse(req.body);
    const r = await loadRequest(body.requestId.trim().toUpperCase());
    const owner = await (0, pool_1.row)('SELECT recovery_circle FROM users WHERE id = $1', [r.owner_user_id]);
    const cfg = (owner?.recovery_circle ?? {});
    if (!(0, codes_1.safeEqual)(cfg.codeHash ?? '', (0, crypto_1.sha256Hex)(body.recoveryCode))) {
        throw (0, errors_1.badRequest)('The recovery code is incorrect.');
    }
    const votes = parseVotes(r.votes);
    const approvalCount = votes.filter((v) => v.decision === 'APPROVED').length;
    if (approvalCount < r.threshold) {
        throw (0, errors_1.forbidden)('This recovery request has not reached its approval threshold yet.');
    }
    if (r.expires_at.getTime() < Date.now()) {
        throw (0, errors_1.badRequest)('This recovery request has expired.');
    }
    const hash = await bcryptjs_1.default.hash(body.newPassword, 12);
    await (0, pool_1.query)(`UPDATE users SET password_hash = $2, password_changed_at = now(), updated_at = now() WHERE id = $1`, [r.owner_user_id, hash]);
    await (0, pool_1.query)(`UPDATE recovery_requests SET status = 'COMPLETED', decided_at = now() WHERE id = $1`, [r.id]);
    res.json({ message: 'Recovery complete. The owner password has been reset.' });
}));
router.post('/requests/:requestId/approve', auth_1.requireAuth, (0, errors_1.asyncHandler)(async (req, res) => {
    const r = await loadRequest(req.params.requestId);
    const votes = parseVotes(r.votes);
    if (votes.some((v) => v.userId === Number(req.userId)))
        throw (0, errors_1.badRequest)('You already voted on this request.');
    if (r.status !== 'PENDING')
        throw (0, errors_1.badRequest)('This request was already decided.');
    votes.push({ userId: Number(req.userId), decision: 'APPROVED' });
    await (0, pool_1.query)(`UPDATE recovery_requests SET votes = $2::jsonb WHERE id = $1`, [r.id, JSON.stringify(votes)]);
    const updated = await loadRequest(r.id);
    const circle = await circleConfig(r.owner_user_id);
    res.json(await toRequestRow(updated, { threshold: circle.threshold, memberIds: circle.memberIds }, Number(req.userId)));
}));
router.post('/requests/:requestId/deny', auth_1.requireAuth, (0, errors_1.asyncHandler)(async (req, res) => {
    const r = await loadRequest(req.params.requestId);
    const votes = parseVotes(r.votes);
    if (votes.some((v) => v.userId === Number(req.userId)))
        throw (0, errors_1.badRequest)('You already voted on this request.');
    if (r.status !== 'PENDING')
        throw (0, errors_1.badRequest)('This request was already decided.');
    votes.push({ userId: Number(req.userId), decision: 'DENIED' });
    await (0, pool_1.query)(`UPDATE recovery_requests SET votes = $2::jsonb WHERE id = $1`, [r.id, JSON.stringify(votes)]);
    const updated = await loadRequest(r.id);
    const circle = await circleConfig(r.owner_user_id);
    res.json(await toRequestRow(updated, { threshold: circle.threshold, memberIds: circle.memberIds }, Number(req.userId)));
}));
router.post('/requests/:requestId/cancel', auth_1.requireAuth, (0, errors_1.asyncHandler)(async (req, res) => {
    const r = await loadRequest(req.params.requestId);
    if (Number(r.owner_user_id) !== Number(req.userId))
        throw (0, errors_1.forbidden)('Only the owning account can cancel this request.');
    await (0, pool_1.query)(`UPDATE recovery_requests SET status = 'CANCELLED', decided_at = now() WHERE id = $1`, [r.id]);
    res.json({ message: 'Recovery request cancelled.' });
}));
exports.default = router;
//# sourceMappingURL=recoveryCircle.js.map