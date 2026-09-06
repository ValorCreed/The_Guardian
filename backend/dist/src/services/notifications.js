"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createNotification = createNotification;
exports.notifyOwnerAboutEmergencyRequest = notifyOwnerAboutEmergencyRequest;
exports.notifyRequesterDecision = notifyRequesterDecision;
const pool_1 = require("../db/pool");
const pusher_1 = require("../lib/pusher");
const mailer_1 = require("../lib/mailer");
async function createNotification(options) {
    const res = await (0, pool_1.query)(`INSERT INTO notifications (user_id, type, title, body, route, data)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id`, [options.userId, options.type, options.title, options.body ?? null, options.route ?? null, JSON.stringify(options.data ?? {})]);
    const id = res.rows[0].id;
    const pushed = await (0, pusher_1.sendPushToUser)(options.userId, {
        title: options.title,
        body: options.body,
        data: { ...(options.data ?? {}), notificationId: String(id), type: options.type, route: options.route },
    });
    if (options.email) {
        try {
            const user = await (0, pool_1.query)(`SELECT email FROM users WHERE id = $1`, [options.userId]);
            if (user.rows[0]) {
                await (0, mailer_1.sendGenericNotificationEmail)(user.rows[0].email, options.title, options.body ?? '');
            }
        }
        catch (err) {
            console.error('[notify] email skipped', err);
        }
    }
    return pushed;
}
async function notifyOwnerAboutEmergencyRequest(ownerUserId, requesterName, requesterEmail) {
    await createNotification({
        userId: ownerUserId,
        type: 'EMERGENCY_REQUEST',
        title: 'New emergency access request',
        body: `${requesterName} (${requesterEmail}) is requesting emergency access to your vault.`,
        route: '/emergencyaccess',
    });
}
async function notifyRequesterDecision(requesterUserId, status) {
    await createNotification({
        userId: requesterUserId,
        type: 'EMERGENCY_REQUEST',
        title: status === 'APPROVED' ? 'Emergency access approved' : 'Emergency access denied',
        body: status === 'APPROVED'
            ? 'The vault owner approved your emergency access request. You can now view approved items.'
            : 'The vault owner denied your emergency access request.',
        route: '/emergencyaccess',
    });
}
//# sourceMappingURL=notifications.js.map