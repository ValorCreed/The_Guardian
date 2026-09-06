"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.forbidden = void 0;
exports.requireFeature = requireFeature;
const errors_1 = require("../lib/errors");
Object.defineProperty(exports, "forbidden", { enumerable: true, get: function () { return errors_1.forbidden; } });
const plan_1 = require("../lib/plan");
/**
 * Gate a route on plan features. Throws 403 when the feature is not included
 * in the user's current plan.
 */
async function requireFeature(req, feature) {
    const plan = await (0, plan_1.getPlanForUser)(Number(req.userId));
    const allowed = plan_1.PLAN_LIMITS[plan][feature];
    if (!allowed) {
        throw (0, errors_1.forbidden)(`This feature is not available on the ${plan} plan. Please upgrade to unlock it.`);
    }
    return plan;
}
//# sourceMappingURL=featureGate.js.map