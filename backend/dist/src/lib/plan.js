"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PLAN_LIMITS = void 0;
exports.getPlanForUser = getPlanForUser;
exports.assertFeature = assertFeature;
const errors_1 = require("./errors");
const pool_1 = require("../db/pool");
exports.PLAN_LIMITS = {
    FREE: {
        deviceLimit: 1,
        noteLimit: 5,
        documentVault: false,
        backup: false,
        emergency: false,
        emergencyContactLimit: null,
        familySharing: false,
        recoveryCircle: false,
        estate: false,
        continuityDrills: false,
        cardVault: true,
    },
    PREMIUM: {
        deviceLimit: 5,
        noteLimit: null,
        documentVault: true,
        backup: true,
        emergency: true,
        emergencyContactLimit: 5,
        familySharing: false,
        recoveryCircle: true,
        estate: false,
        continuityDrills: false,
        cardVault: true,
    },
    FAMILY: {
        deviceLimit: 10,
        noteLimit: null,
        documentVault: true,
        backup: true,
        emergency: true,
        emergencyContactLimit: 10,
        familySharing: true,
        recoveryCircle: true,
        estate: true,
        continuityDrills: true,
        cardVault: true,
    },
};
async function getPlanForUser(userId) {
    const res = await (0, pool_1.query)(`SELECT COALESCE(s.plan, 'FREE') AS plan
       FROM users u
       LEFT JOIN subscriptions s ON s.user_id = u.id
      WHERE u.id = $1`, [userId]);
    const plan = res.rows[0]?.plan ?? 'FREE';
    if (plan === 'PREMIUM' || plan === 'FAMILY')
        return plan;
    return 'FREE';
}
function assertFeature(userId, plan, feature, message) {
    const allowed = exports.PLAN_LIMITS[plan][feature];
    if (!allowed) {
        const featureName = String(feature)
            .replace(/([A-Z])/g, ' $1')
            .trim()
            .toLowerCase();
        throw (0, errors_1.forbidden)(message ??
            `This feature (${featureName}) is not available on the ${plan} plan. Please upgrade to unlock it.`);
    }
    return allowed;
}
//# sourceMappingURL=plan.js.map