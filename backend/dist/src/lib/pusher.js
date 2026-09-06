"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getPushTokensForUser = getPushTokensForUser;
exports.upsertPushToken = upsertPushToken;
exports.deletePushToken = deletePushToken;
exports.sendPushToUser = sendPushToUser;
const expo_server_sdk_1 = require("expo-server-sdk");
const pool_1 = require("../db/pool");
const env_1 = require("../config/env");
let expo = null;
function getExpo() {
    if (!expo) {
        expo = env_1.env.EXPO_ACCESS_TOKEN ? new expo_server_sdk_1.Expo({ accessToken: env_1.env.EXPO_ACCESS_TOKEN }) : new expo_server_sdk_1.Expo();
    }
    return expo;
}
async function getPushTokensForUser(userId) {
    const res = await (0, pool_1.query)(`SELECT token FROM push_tokens WHERE user_id = $1`, [userId]);
    return res.rows.map((r) => r.token);
}
async function upsertPushToken(userId, installationId, token, platform, deviceName, appVersion) {
    await (0, pool_1.query)(`INSERT INTO push_tokens (user_id, token, installation_id, created_at)
     VALUES ($1, $2, $3, now())
     ON CONFLICT ON CONSTRAINT push_tokens_user_id_token_key
     DO UPDATE SET installation_id = EXCLUDED.installation_id`, [userId, token, installationId]);
}
async function deletePushToken(userId, installationId) {
    await (0, pool_1.query)(`DELETE FROM push_tokens WHERE user_id = $1 AND installation_id = $2`, [userId, installationId]);
}
/**
 * Send a notification to every push token registered for the user. Invalid
 * tokens are pruned. Returns the number of accepted messages.
 */
async function sendPushToUser(userId, payload) {
    const tokens = await getPushTokensForUser(userId);
    if (tokens.length === 0)
        return 0;
    const messages = [];
    const removeTokens = [];
    for (const token of tokens) {
        if (!expo_server_sdk_1.Expo.isExpoPushToken(token)) {
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
        await (0, pool_1.query)(`DELETE FROM push_tokens WHERE token = ANY($1::text[])`, [removeTokens]);
    }
    if (messages.length === 0)
        return 0;
    try {
        const chunks = getExpo().chunkPushNotifications(messages);
        let sent = 0;
        for (const chunk of chunks) {
            const tickets = await getExpo().sendPushNotificationsAsync(chunk);
            sent += chunk.length;
            void checkReceipts(getExpo(), tickets, tokens);
        }
        return sent;
    }
    catch (err) {
        console.error('[push] failed', err);
        return 0;
    }
}
async function checkReceipts(expoInstance, tickets, tokens) {
    try {
        const receiptIds = tickets.map((t) => t.id).filter((id) => Boolean(id));
        if (receiptIds.length === 0)
            return;
        const receiptChunks = expoInstance.chunkPushNotificationReceiptIds(receiptIds);
        for (const chunk of receiptChunks) {
            const receipts = await expoInstance.getPushNotificationReceiptsAsync(chunk);
            const drop = [];
            for (const id of receiptIds) {
                const receipt = receipts[id];
                if (receipt && receipt.status === 'error') {
                    const idx = tickets.findIndex((t) => t.id === id);
                    if (idx >= 0 && tokens[idx])
                        drop.push(tokens[idx]);
                }
            }
            if (drop.length > 0) {
                await (0, pool_1.query)(`DELETE FROM push_tokens WHERE token = ANY($1::text[])`, [drop]);
            }
        }
    }
    catch (err) {
        console.error('[push] receipt check failed', err);
    }
}
//# sourceMappingURL=pusher.js.map