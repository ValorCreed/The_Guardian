"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const zod_1 = require("zod");
const errors_1 = require("../lib/errors");
const pool_1 = require("../db/pool");
const auth_1 = require("../middleware/auth");
const pusher_1 = require("../lib/pusher");
const pusher_2 = require("../lib/pusher");
const router = (0, express_1.Router)({ mergeParams: true });
function toNotification(n) {
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
router.get('/', auth_1.requireAuth, (0, errors_1.asyncHandler)(async (req, res) => {
    const items = await (0, pool_1.rows)(`SELECT * FROM notifications WHERE user_id = $1 ORDER BY created_at DESC LIMIT 50`, [req.userId]);
    res.json(items.map(toNotification));
}));
router.get('/unread-count', auth_1.requireAuth, (0, errors_1.asyncHandler)(async (req, res) => {
    const r = await (0, pool_1.row)('SELECT COUNT(*)::int AS count FROM notifications WHERE user_id = $1 AND read = false', [req.userId]);
    res.json({ unreadCount: Number(r?.count ?? 0) });
}));
router.put('/:id/read', auth_1.requireAuth, (0, errors_1.asyncHandler)(async (req, res) => {
    const n = await (0, pool_1.row)(`UPDATE notifications SET read = true WHERE id = $1 AND user_id = $2 RETURNING *`, [req.params.id, req.userId]);
    if (!n)
        throw (0, errors_1.notFound)('No notification found.');
    res.json(toNotification(n));
}));
router.put('/read-all', auth_1.requireAuth, (0, errors_1.asyncHandler)(async (req, res) => {
    await (0, pool_1.query)(`UPDATE notifications SET read = true WHERE user_id = $1`, [req.userId]);
    res.status(204).send();
}));
router.delete('/:id', auth_1.requireAuth, (0, errors_1.asyncHandler)(async (req, res) => {
    const deleted = await (0, pool_1.query)(`DELETE FROM notifications WHERE id = $1 AND user_id = $2`, [req.params.id, req.userId]);
    if ((deleted.rowCount ?? 0) === 0)
        throw (0, errors_1.notFound)('No notification found.');
    res.status(204).send();
}));
const pushTokenSchema = zod_1.z.object({
    installationId: zod_1.z.string().min(1),
    expoPushToken: zod_1.z.string().min(1),
    platform: zod_1.z.enum(['android', 'ios']),
    deviceName: zod_1.z.string().min(1).max(120),
    appVersion: zod_1.z.string().max(60).nullable().optional(),
});
router.put('/push-token', auth_1.requireAuth, (0, errors_1.asyncHandler)(async (req, res) => {
    const body = pushTokenSchema.parse(req.body);
    await (0, pusher_1.upsertPushToken)(Number(req.userId), body.installationId, body.expoPushToken, body.platform, body.deviceName, body.appVersion ?? null);
    res.json({
        registered: true,
        installationId: body.installationId,
        platform: body.platform,
        deviceName: body.deviceName,
        lastSeenAt: new Date().toISOString(),
    });
}));
router.delete('/push-token/:installationId', auth_1.requireAuth, (0, errors_1.asyncHandler)(async (req, res) => {
    await (0, pusher_2.deletePushToken)(Number(req.userId), req.params.installationId);
    res.status(204).send();
}));
const DEFAULT_PREFERENCES = {
    pushEnabled: true,
    securityAlerts: true,
    emergencyRecovery: true,
    continuityReminders: true,
    billing: true,
    productUpdates: true,
};
async function loadPrefs(userId) {
    const r = await (0, pool_1.row)('SELECT prefs FROM notification_preferences WHERE user_id = $1', [userId]);
    const stored = (r?.prefs ?? {});
    const merged = { ...DEFAULT_PREFERENCES };
    for (const key of Object.keys(merged)) {
        if (typeof stored[key] === 'boolean')
            merged[key] = stored[key];
    }
    return merged;
}
router.get('/preferences', auth_1.requireAuth, (0, errors_1.asyncHandler)(async (req, res) => {
    res.json(await loadPrefs(Number(req.userId)));
}));
router.put('/preferences', auth_1.requireAuth, (0, errors_1.asyncHandler)(async (req, res) => {
    const body = zod_1.z
        .object({
        pushEnabled: zod_1.z.boolean().optional(),
        securityAlerts: zod_1.z.boolean().optional(),
        emergencyRecovery: zod_1.z.boolean().optional(),
        continuityReminders: zod_1.z.boolean().optional(),
        billing: zod_1.z.boolean().optional(),
        productUpdates: zod_1.z.boolean().optional(),
    })
        .parse(req.body);
    const merged = { ...(await loadPrefs(Number(req.userId))), ...body };
    await (0, pool_1.query)(`INSERT INTO notification_preferences (user_id, prefs, updated_at)
       VALUES ($1, $2, now())
       ON CONFLICT (user_id) DO UPDATE SET prefs = EXCLUDED.prefs, updated_at = now()`, [req.userId, JSON.stringify(merged)]);
    res.json(merged);
}));
exports.default = router;
//# sourceMappingURL=notifications.js.map