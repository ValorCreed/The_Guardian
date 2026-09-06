import { forbidden } from './errors';
import { query } from '../db/pool';

export type Plan = 'FREE' | 'PREMIUM' | 'FAMILY';

export const PLAN_LIMITS: Record<Plan, {
  deviceLimit: number;
  noteLimit: number | null; // null = unlimited
  documentVault: boolean;
  backup: boolean;
  emergency: boolean;
  emergencyContactLimit: number | null;
  familySharing: boolean;
  recoveryCircle: boolean;
  estate: boolean;
  continuityDrills: boolean;
  cardVault: boolean;
}> = {
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

export async function getPlanForUser(userId: number): Promise<Plan> {
  const res = await query<{ plan: string }>(
    `SELECT COALESCE(s.plan, 'FREE') AS plan
       FROM users u
       LEFT JOIN subscriptions s ON s.user_id = u.id
      WHERE u.id = $1`,
    [userId]
  );
  const plan = res.rows[0]?.plan ?? 'FREE';
  if (plan === 'PREMIUM' || plan === 'FAMILY') return plan;
  return 'FREE';
}

export function assertFeature(userId: number, plan: Plan, feature: keyof (typeof PLAN_LIMITS)['FREE'], message?: string) {
  const allowed = PLAN_LIMITS[plan][feature];
  if (!allowed) {
    const featureName = String(feature)
      .replace(/([A-Z])/g, ' $1')
      .trim()
      .toLowerCase();
    throw forbidden(
      message ??
        `This feature (${featureName}) is not available on the ${plan} plan. Please upgrade to unlock it.`
    );
  }
  return allowed;
}