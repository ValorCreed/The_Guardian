"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const errors_1 = require("../lib/errors");
const pool_1 = require("../db/pool");
const auth_1 = require("../middleware/auth");
const router = (0, express_1.Router)({ mergeParams: true });
async function revokeSession(sessionId, by) {
    await (0, pool_1.query)(`UPDATE sessions SET revoked_at = now(), revoked_by = COALESCE($2, revoked_by) WHERE id = $1::uuid`, [sessionId, by ?? null]);
}
function toDeviceSession(s, currentSessionId) {
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
router.get('/', auth_1.requireAuth, (0, errors_1.asyncHandler)(async (req, res) => {
    const sessionRows = await (0, pool_1.rows)(`SELECT id, device_name, device_type, device_id, ip_address, last_active_at, created_at, revoked_at
         FROM sessions WHERE user_id = $1 AND revoked_at IS NULL
        ORDER BY last_active_at DESC`, [req.userId]);
    res.json(sessionRows.map((s) => toDeviceSession(s, String(req.sessionId))));
}));
router.get('/heartbeat', auth_1.requireAuth, (0, errors_1.asyncHandler)(async (req, res) => {
    await (0, pool_1.query)(`UPDATE sessions SET last_active_at = now() WHERE id = $1`, [req.sessionId]);
    res.json({ active: true, message: 'Session is active.' });
}));
router.delete('/:id', auth_1.requireAuth, (0, errors_1.asyncHandler)(async (req, res) => {
    const target = String(req.params.id);
    if (target === String(req.sessionId)) {
        await revokeSession(String(req.sessionId), 'current');
        return res.json({ message: 'Current session ended.' });
    }
    const deleted = await (0, pool_1.query)(`DELETE FROM sessions WHERE id = $1::uuid AND user_id = $2`, [target, req.userId]);
    if ((deleted.rowCount ?? 0) === 0)
        throw (0, errors_1.notFound)('No session found.');
    res.json({ message: 'Device session revoked.' });
}));
router.post('/logout-others', auth_1.requireAuth, (0, errors_1.asyncHandler)(async (req, res) => {
    const revoked = await (0, pool_1.query)(`UPDATE sessions SET revoked_at = now(), revoked_by = 'other' WHERE user_id = $1 AND id <> $2 AND revoked_at IS NULL`, [req.userId, req.sessionId]);
    res.json({ message: 'Other devices logged out.', revokedCount: revoked.rowCount ?? 0 });
}));
router.post('/logout-all', auth_1.requireAuth, (0, errors_1.asyncHandler)(async (req, res) => {
    const revoked = await (0, pool_1.query)(`UPDATE sessions SET revoked_at = now(), revoked_by = 'all' WHERE user_id = $1 AND revoked_at IS NULL`, [req.userId]);
    await revokeSession(String(req.sessionId), 'all');
    res.json({ message: 'All devices logged out.', revokedCount: revoked.rowCount ?? 0 });
}));
exports.default = router;
//# sourceMappingURL=sessions.js.map