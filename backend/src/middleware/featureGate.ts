import type { AuthedRequest } from './auth';
import { forbidden } from '../lib/errors';
import { getPlanForUser, PLAN_LIMITS, type Plan } from '../lib/plan';

export type FeatureKey = keyof (typeof PLAN_LIMITS)['FREE'];

/**
 * Gate a route on plan features. Throws 403 when the feature is not included
 * in the user's current plan.
 */
export async function requireFeature(req: AuthedRequest, feature: FeatureKey): Promise<Plan> {
  const plan = await getPlanForUser(Number(req.userId));
  const allowed = PLAN_LIMITS[plan][feature];
  if (!allowed) {
    throw forbidden(
      `This feature is not available on the ${plan} plan. Please upgrade to unlock it.`
    );
  }
  return plan;
}

export { forbidden };