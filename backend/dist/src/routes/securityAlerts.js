"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const zod_1 = require("zod");
const errors_1 = require("../lib/errors");
const pool_1 = require("../db/pool");
const auth_1 = require("../middleware/auth");
const notifications_1 = require("../services/notifications");
const router = (0, express_1.Router)({ mergeParams: true });
const bodySchema = zod_1.z.object({
    score: zod_1.z.number().min(0).max(100),
    totalIssues: zod_1.z.number().int().nonnegative(),
    breachedCount: zod_1.z.number().int().nonnegative(),
    weakCount: zod_1.z.number().int().nonnegative(),
    reusedCount: zod_1.z.number().int().nonnegative(),
    oldCount: zod_1.z.number().int().nonnegative(),
});
router.post('/scan', auth_1.requireAuth, (0, errors_1.asyncHandler)(async (req, res) => {
    const body = bodySchema.parse(req.body);
    await (0, pool_1.query)(`INSERT INTO security_alerts (user_id, alert_type, severity, title, message)
       VALUES ($1, 'SECURITY_SCAN_ALERT', $2, $3, $4)`, [
        req.userId,
        body.score < 60 ? 'high' : body.score < 80 ? 'medium' : 'low',
        `Security scan complete: ${body.score}/100`,
        `${body.totalIssues} issue(s) found (${body.breachedCount} breached, ${body.weakCount} weak, ${body.reusedCount} reused, ${body.oldCount} old).`,
    ]);
    if (body.breachedCount > 0 || body.totalIssues > 0) {
        await (0, notifications_1.createNotification)({
            userId: Number(req.userId),
            type: 'SECURITY_SCAN_ALERT',
            title: 'Security issues detected',
            body: `Your last security scan found ${body.totalIssues} issue(s). Review your security health.`,
            route: '/securityhealth',
        });
    }
    res.json({ message: 'Security scan reported.' });
}));
exports.default = router;
//# sourceMappingURL=securityAlerts.js.map