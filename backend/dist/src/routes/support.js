"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const zod_1 = require("zod");
const errors_1 = require("../lib/errors");
const pool_1 = require("../db/pool");
const auth_1 = require("../middleware/auth");
const notifications_1 = require("../services/notifications");
const router = (0, express_1.Router)({ mergeParams: true });
function toBug(b) {
    return {
        id: Number(b.id),
        title: b.title,
        category: b.category,
        severity: b.severity,
        description: b.description,
        stepsToReproduce: b.steps_to_reproduce,
        includeDiagnostics: b.include_diagnostics,
        deviceInfo: b.device_info,
        appVersion: b.app_version,
        status: b.status,
        createdAt: b.created_at.toISOString(),
        updatedAt: b.updated_at.toISOString(),
    };
}
const bodySchema = zod_1.z.object({
    title: zod_1.z.string().trim().min(1).max(150),
    category: zod_1.z.string().trim().min(1).max(60),
    severity: zod_1.z.enum(['low', 'medium', 'high', 'critical']),
    description: zod_1.z.string().trim().min(1).max(4000),
    stepsToReproduce: zod_1.z.string().trim().max(4000).optional(),
    includeDiagnostics: zod_1.z.boolean().optional(),
    deviceInfo: zod_1.z.string().trim().max(400).optional(),
    appVersion: zod_1.z.string().trim().max(60).optional(),
});
router.post('/bug-reports', auth_1.requireAuth, (0, errors_1.asyncHandler)(async (req, res) => {
    const body = bodySchema.parse(req.body);
    const bug = await (0, pool_1.row)(`INSERT INTO bug_reports
         (user_id, title, category, severity, description, steps_to_reproduce, include_diagnostics, device_info, app_version)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING *`, [
        req.userId,
        body.title,
        body.category,
        body.severity,
        body.description,
        body.stepsToReproduce ?? null,
        body.includeDiagnostics ?? false,
        body.deviceInfo ?? null,
        body.appVersion ?? null,
    ]);
    await (0, notifications_1.createNotification)({
        userId: Number(req.userId),
        type: 'SYSTEM',
        title: 'Bug report received',
        body: 'Thank you for reporting this. Our team will review it.',
        route: '/support',
    });
    res.status(201).json(toBug(bug));
}));
router.get('/bug-reports/my', auth_1.requireAuth, (0, errors_1.asyncHandler)(async (req, res) => {
    const bugs = await (0, pool_1.rows)(`SELECT * FROM bug_reports WHERE user_id = $1 ORDER BY created_at DESC LIMIT 20`, [req.userId]);
    res.json(bugs.map(toBug));
}));
exports.default = router;
//# sourceMappingURL=support.js.map