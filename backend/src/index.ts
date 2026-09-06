import { schedule } from 'node-cron';

import { env } from './config/env';
import { createApp } from './app';
import { migrate } from './db/migrate';
import { pool, query, row } from './db/pool';
import { sendGenericNotificationEmail } from './lib/mailer';
import { createNotification } from './services/notifications';
import { sendPushToUser } from './lib/pusher';

async function runDuressDelayedAlerts(): Promise<void> {
  const jobs = await pool!.query<{
    user_id: number;
    alert_contact_user_id: number;
    alert_delay_minutes: number;
    incident_id: number;
  }>(
    `SELECT d.user_id, d.alert_contact_user_id, d.alert_delay_minutes, d.incident_id
       FROM duress_settings d
       JOIN incidents i ON i.id = d.incident_id AND i.status = 'ACTIVE'
      WHERE d.pending_alert_count > 0
        AND d.alert_enabled = true
        AND d.alert_delay_minutes > 0
        AND (now() - i.started_at) >= (d.alert_delay_minutes || ' minutes')::interval`
  );

  for (const j of jobs.rows) {
    const contact = await query<{ full_name: string; email: string }>(
      `SELECT full_name, email FROM users WHERE id = $1`,
      [j.alert_contact_user_id]
    );
    const summary = `A duress event was triggered on a Guardian account you are a designated contact for. The owner may be under duress or coercion. Follow your agreed safeguarding steps.`;
    await createNotification({
      userId: j.alert_contact_user_id,
      type: 'DURESS_ALERT',
      title: 'Duress alert',
      body: summary,
      route: '/notifications',
      email: false,
    });
    if (j.alert_contact_user_id) {
      await sendPushToUser(j.alert_contact_user_id, {
        title: 'Duress alert',
        body: summary,
        data: { notificationId: '', type: 'DURESS_ALERT', route: '/notifications' },
      });
    }
    if (contact.rows[0]?.email) {
      await sendGenericNotificationEmail(contact.rows[0].email, 'Guardian duress alert', summary);
    }
    await query(`UPDATE duress_settings SET pending_alert_count = 0 WHERE user_id = $1`, [j.user_id]);
  }
}

async function runSafetyCheckExpiry(): Promise<void> {
  const expired = await pool!.query<{ user_id: number; id: number }>(
    `SELECT sc.user_id, sc.id
       FROM safety_checks sc
      WHERE sc.status = 'ACTIVE' AND sc.expires_at <= now()
      LIMIT 50`
  );
  for (const e of expired.rows) {
    await query(`UPDATE safety_checks SET status = 'GRACE', result = 'timeout' WHERE id = $1`, [e.id]);
    const settings = await row<{ contact_id: number | null; grace_period_hours: number }>(
      `SELECT contact_id, grace_period_hours FROM safety_check_settings WHERE user_id = $1`,
      [e.user_id]
    );
    const contact = settings?.contact_id
      ? await query<{ full_name: string; email: string }>(`SELECT full_name, email FROM users WHERE id = $1`, [settings.contact_id])
      : null;
    const body = 'Your check-in window expired. If you do not check in within the grace period, your trusted contact will be notified.';
    await createNotification({
      userId: e.user_id,
      type: 'SAFETY_CHECK_GRACE_STARTED',
      title: 'Check-in overdue',
      body,
      route: '/safetycheck',
    });
    if (contact?.rows[0]?.email) {
      await sendGenericNotificationEmail(
        contact.rows[0].email,
        'Guardian safety check overdue',
        `A Guardian safety check for ${contact.rows[0].full_name} missed its window. Please make contact as agreed.`
      );
    }
  }
}

async function runRecoveryRequestExpiry(): Promise<void> {
  const expired = await query<{ id: string }>(
    `UPDATE recovery_requests SET status = 'EXPIRED', decided_at = decided_at
      WHERE status = 'PENDING' AND expires_at <= now()
      RETURNING id`
  );
  if (expired.rowCount) console.log(`[cron] expired ${expired.rowCount} recovery request(s)`);
}

async function runSessionCleanup(): Promise<void> {
  const cleaned = await query(
    `UPDATE sessions SET revoked_at = now(), revoked_by = 'expired'
      WHERE revoked_at IS NULL AND expires_at <= now()`
  );
  if (cleaned.rowCount) console.log(`[cron] cleared ${cleaned.rowCount} expired session(s)`);
}

export function startCronJobs(): void {
  schedule('* * * * *', () => {
    runDuressDelayedAlerts().catch((err) => console.error('[cron] duress alerts', err));
    runSafetyCheckExpiry().catch((err) => console.error('[cron] safety checks', err));
  });
  schedule('0 * * * *', () => {
    runRecoveryRequestExpiry().catch((err) => console.error('[cron] recovery requests', err));
  });
  schedule('0 2 * * *', () => {
    runSessionCleanup().catch((err) => console.error('[cron] session cleanup', err));
  });
  console.log('[cron] scheduled jobs registered');
}

async function boot(): Promise<void> {
  await migrate();
  startCronJobs();
  const app = createApp();
  const port = env.PORT;
  app.listen(port, () => {
    console.log(`[guardian] listening on :${port} (${env.NODE_ENV})`);
  });
}

if (require.main === module) {
  boot().catch((err) => {
    console.error('[guardian] startup failed', err);
    process.exit(1);
  });
}

export { boot };
