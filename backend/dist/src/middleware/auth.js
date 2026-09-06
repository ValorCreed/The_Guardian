"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.captureDeviceHeaders = captureDeviceHeaders;
exports.requireAuth = requireAuth;
exports.cleanEmail = cleanEmail;
const token_1 = require("../lib/token");
const pool_1 = require("../db/pool");
const errors_1 = require("../lib/errors");
const DEVICE_HEADER_MAX = 120;
function sanitizeHeader(value, max) {
    if (!value)
        return null;
    const clean = value.trim().slice(0, max).replace(/[\u0000-\u001f]/g, '');
    return clean || null;
}
function captureDeviceHeaders(req) {
    req.deviceId = sanitizeHeader(req.header('X-Guardian-Device-Id'), DEVICE_HEADER_MAX);
    req.deviceName = sanitizeHeader(req.header('X-Guardian-Device-Name'), DEVICE_HEADER_MAX);
    req.deviceType = sanitizeHeader(req.header('X-Guardian-Device-Type'), DEVICE_HEADER_MAX);
}
async function requireAuth(req, _res, next) {
    captureDeviceHeaders(req);
    const header = req.header('Authorization') ?? req.header('authorization');
    if (!header || !header.startsWith('Bearer ')) {
        next((0, errors_1.unauthorized)());
        return;
    }
    const token = header.slice('Bearer '.length).trim();
    if (!token) {
        next((0, errors_1.unauthorized)());
        return;
    }
    let payload;
    try {
        payload = (0, token_1.verifyUserToken)(token);
    }
    catch {
        next((0, errors_1.unauthorized)('Your session is invalid or has expired.'));
        return;
    }
    const userId = Number(payload.sub);
    if (!Number.isInteger(userId) || userId <= 0) {
        next((0, errors_1.unauthorized)());
        return;
    }
    const session = await (0, pool_1.row)(`SELECT s.id, s.user_id, s.mode, s.expires_at
       FROM sessions s
      WHERE s.id = $1 AND s.user_id = $2 AND s.expires_at > now() AND s.revoked_at IS NULL`, [payload.sid, userId]);
    if (!session) {
        next((0, errors_1.unauthorized)('Your session has been revoked. Please sign in again.'));
        return;
    }
    req.userId = userId;
    req.sessionId = payload.sid;
    req.sessionMode = payload.mode === 'DURESS' ? 'DURESS' : 'NORMAL';
    await (0, pool_1.query)(`UPDATE sessions SET last_active_at = now() WHERE id = $1`, [session.id]);
    next();
}
/** Allow an optional "email query param" style parse reused by many routes. */
function cleanEmail(v) {
    return (v ?? '').trim().toLowerCase().replace(/\s+/g, '');
}
//# sourceMappingURL=auth.js.map