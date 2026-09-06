import { query } from '../db/pool';
import { sendPushToUser } from '../lib/pusher';
import { sendGenericNotificationEmail } from '../lib/mailer';

export interface NotifyOptions {
  userId: number;
  type: string;
  title: string;
  body?: string;
  route?: string;
  data?: Record<string, unknown>;
  email?: boolean;
}

export async function createNotification(options: NotifyOptions): Promise<number> {
  const res = await query<{ id: number }>(
    `INSERT INTO notifications (user_id, type, title, body, route, data)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id`,
    [options.userId, options.type, options.title, options.body ?? null, options.route ?? null, JSON.stringify(options.data ?? {})]
  );
  const id = res.rows[0].id;

  const pushed = await sendPushToUser(options.userId, {
    title: options.title,
    body: options.body,
    data: { ...(options.data ?? {}), notificationId: String(id), type: options.type, route: options.route },
  });

  if (options.email) {
    try {
      const user = await query<{ email: string }>(`SELECT email FROM users WHERE id = $1`, [options.userId]);
      if (user.rows[0]) {
        await sendGenericNotificationEmail(user.rows[0].email, options.title, options.body ?? '');
      }
    } catch (err) {
      console.error('[notify] email skipped', err);
    }
  }

  return pushed;
}

export async function notifyOwnerAboutEmergencyRequest(ownerUserId: number, requesterName: string, requesterEmail: string): Promise<void> {
  await createNotification({
    userId: ownerUserId,
    type: 'EMERGENCY_REQUEST',
    title: 'New emergency access request',
    body: `${requesterName} (${requesterEmail}) is requesting emergency access to your vault.`,
    route: '/emergencyaccess',
  });
}

export async function notifyRequesterDecision(requesterUserId: number, status: string): Promise<void> {
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