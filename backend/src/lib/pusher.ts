import { Expo, type ExpoPushMessage } from 'expo-server-sdk';
import { query } from '../db/pool';
import { env } from '../config/env';

export interface PushPayload {
  title: string;
  body?: string;
  data?: Record<string, unknown>;
}

let expo: Expo | null = null;

function getExpo(): Expo {
  if (!expo) {
    expo = env.EXPO_ACCESS_TOKEN ? new Expo({ accessToken: env.EXPO_ACCESS_TOKEN }) : new Expo();
  }
  return expo;
}

export async function getPushTokensForUser(userId: number): Promise<string[]> {
  const res = await query<{ token: string }>(`SELECT token FROM push_tokens WHERE user_id = $1`, [userId]);
  return res.rows.map((r) => r.token);
}

export async function upsertPushToken(
  userId: number,
  installationId: string,
  token: string,
  platform: string,
  deviceName: string,
  appVersion: string | null
): Promise<void> {
  await query(
    `INSERT INTO push_tokens (user_id, token, installation_id, created_at)
     VALUES ($1, $2, $3, now())
     ON CONFLICT ON CONSTRAINT push_tokens_user_id_token_key
     DO UPDATE SET installation_id = EXCLUDED.installation_id`,
    [userId, token, installationId]
  );
}

export async function deletePushToken(userId: number, installationId: string): Promise<void> {
  await query(`DELETE FROM push_tokens WHERE user_id = $1 AND installation_id = $2`, [userId, installationId]);
}

/**
 * Send a notification to every push token registered for the user. Invalid
 * tokens are pruned. Returns the number of accepted messages.
 */
export async function sendPushToUser(userId: number, payload: PushPayload): Promise<number> {
  const tokens = await getPushTokensForUser(userId);
  if (tokens.length === 0) return 0;

  const messages: ExpoPushMessage[] = [];
  const removeTokens: string[] = [];

  for (const token of tokens) {
    if (!Expo.isExpoPushToken(token)) {
      removeTokens.push(token);
      continue;
    }
    messages.push({
      to: token,
      sound: 'default',
      title: payload.title,
      body: payload.body,
      data: {
        notificationId: String(payload.data?.notificationId ?? ''),
        type: String(payload.data?.type ?? 'GENERAL'),
        route: String(payload.data?.route ?? '/notifications'),
      },
      priority: 'high',
    });
  }

  if (removeTokens.length > 0) {
    await query(`DELETE FROM push_tokens WHERE token = ANY($1::text[])`, [removeTokens]);
  }

  if (messages.length === 0) return 0;

  try {
    const chunks = getExpo().chunkPushNotifications(messages);
    let sent = 0;
    for (const chunk of chunks) {
      const tickets = await getExpo().sendPushNotificationsAsync(chunk);
      sent += chunk.length;
      void checkReceipts(getExpo(), tickets, tokens);
    }
    return sent;
  } catch (err) {
    console.error('[push] failed', err);
    return 0;
  }
}

async function checkReceipts(
  expoInstance: Expo,
  tickets: Array<{ status: string; id?: string }>,
  tokens: string[]
): Promise<void> {
  try {
    const receiptIds = tickets.map((t) => t.id).filter((id): id is string => Boolean(id));
    if (receiptIds.length === 0) return;
    const receiptChunks = expoInstance.chunkPushNotificationReceiptIds(receiptIds);
    for (const chunk of receiptChunks) {
      const receipts = await expoInstance.getPushNotificationReceiptsAsync(chunk);
      const drop: string[] = [];
      for (const id of receiptIds) {
        const receipt = receipts[id];
        if (receipt && receipt.status === 'error') {
          const idx = tickets.findIndex((t) => t.id === id);
          if (idx >= 0 && tokens[idx]) drop.push(tokens[idx]);
        }
      }
      if (drop.length > 0) {
        await query(`DELETE FROM push_tokens WHERE token = ANY($1::text[])`, [drop]);
      }
    }
  } catch (err) {
    console.error('[push] receipt check failed', err);
  }
}