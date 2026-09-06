"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const zod_1 = require("zod");
const errors_1 = require("../lib/errors");
const pool_1 = require("../db/pool");
const crypto_1 = require("../lib/crypto");
const codes_1 = require("../lib/codes");
const auth_1 = require("../middleware/auth");
const featureGate_1 = require("../middleware/featureGate");
const notifications_1 = require("../services/notifications");
const router = (0, express_1.Router)({ mergeParams: true });
async function userById(id) {
    return (0, pool_1.row)(`SELECT id, email, full_name, password_hash, recovery_kit_id, recovery_kit_hash, recovery_kit_expires_at, updated_at
       FROM users WHERE id = $1`, [id]);
}
router.get('/status', auth_1.requireAuth, (0, errors_1.asyncHandler)(async (req, res) => {
    if (req.sessionMode === 'DURESS') {
        return res.json({ created: false, recoveryId: null, createdAt: null, lastUsedAt: null });
    }
    await (0, featureGate_1.requireFeature)(req, 'recoveryCircle');
    const user = await userById(Number(req.userId));
    if (!user)
        throw (0, errors_1.notFound)();
    res.json({
        created: Boolean(user.recovery_kit_id),
        recoveryId: user.recovery_kit_id ?? null,
        createdAt: user.updated_at.toISOString(),
        lastUsedAt: user.updated_at.toISOString(),
    });
}));
router.post('/generate', auth_1.requireAuth, (0, errors_1.asyncHandler)(async (req, res) => {
    if (req.sessionMode === 'DURESS')
        throw (0, errors_1.forbidden)('Not available in this session.');
    await (0, featureGate_1.requireFeature)(req, 'recoveryCircle');
    const body = zod_1.z.object({ password: zod_1.z.string().min(1).max(128) }).parse(req.body);
    const user = await userById(Number(req.userId));
    if (!user)
        throw (0, errors_1.notFound)();
    if (!(await bcryptjs_1.default.compare(body.password, user.password_hash))) {
        throw (0, errors_1.forbidden)('Your current password is incorrect.');
    }
    const recoveryId = `GK-${(0, codes_1.randomToken)(6).toUpperCase()}`;
    const recoveryKey = `RC-${(0, codes_1.randomToken)(18)}`;
    await (0, pool_1.query)(`UPDATE users
          SET recovery_kit_id = $2, recovery_kit_hash = $3,
              recovery_kit_expires_at = now() + interval '30 days',
              updated_at = now()
        WHERE id = $1`, [user.id, recoveryId, (0, crypto_1.sha256Hex)(recoveryKey)]);
    await (0, notifications_1.createNotification)({
        userId: user.id,
        type: 'RECOVERY_KIT',
        title: 'Recovery kit ready',
        body: 'Your guardian recovery kit is active. Keep the recovery key somewhere safe.',
        route: '/recoverykit',
    });
    res.status(201).json({
        recoveryId,
        recoveryKey,
        createdAt: new Date().toISOString(),
        message: 'Recovery kit generated. Store the recovery key somewhere safe and offline.',
    });
}));
router.delete('/', auth_1.requireAuth, (0, errors_1.asyncHandler)(async (req, res) => {
    await (0, pool_1.query)(`UPDATE users SET recovery_kit_id = NULL, recovery_kit_hash = NULL, recovery_kit_expires_at = NULL, updated_at = now() WHERE id = $1`, [req.userId]);
    res.json({ message: 'Recovery kit revoked.' });
}));
async function resolveKit(recoveryId) {
    const user = await (0, pool_1.row)(`SELECT id, email, full_name, password_hash, recovery_kit_id, recovery_kit_hash, recovery_kit_expires_at, updated_at
       FROM users WHERE recovery_kit_id = $1`, [recoveryId.trim().toUpperCase()]);
    if (!user)
        throw (0, errors_1.notFound)('No recovery kit found for that recovery ID.');
    return user;
}
router.post('/reset-password', (0, errors_1.asyncHandler)(async (req, res) => {
    const body = zod_1.z
        .object({
        recoveryId: zod_1.z.string().min(1).max(80),
        recoveryKey: zod_1.z.string().min(1).max(300),
        newPassword: zod_1.z.string().min(8).max(128),
    })
        .parse(req.body);
    const user = await resolveKit(body.recoveryId);
    if (!user.recovery_kit_hash)
        throw (0, errors_1.notFound)('No recovery kit found for that recovery ID.');
    if (user.recovery_kit_expires_at && user.recovery_kit_expires_at.getTime() < Date.now()) {
        throw (0, errors_1.forbidden)('This recovery kit has expired. Generate a new one.');
    }
    if (!(0, codes_1.safeEqual)(user.recovery_kit_hash, (0, crypto_1.sha256Hex)(body.recoveryKey))) {
        throw (0, errors_1.badRequest)('The recovery key is incorrect.');
    }
    const hash = await bcryptjs_1.default.hash(body.newPassword, 12);
    await (0, pool_1.query)(`UPDATE users SET password_hash = $2, password_changed_at = now(), updated_at = now() WHERE id = $1`, [user.id, hash]);
    await (0, pool_1.query)(`DELETE FROM biometric_credentials WHERE user_id = $1`, [user.id]);
    res.json({ message: 'Your password was recovered with the recovery kit. Please sign in.' });
}));
router.post('/reset-account', (0, errors_1.asyncHandler)(async (req, res) => {
    const body = zod_1.z
        .object({
        email: zod_1.z.string().trim().toLowerCase().email(),
        resetCode: zod_1.z.string().min(1).max(80),
        newPassword: zod_1.z.string().min(8).max(128),
    })
        .parse(req.body);
    const user = await (0, pool_1.row)(`SELECT id, email, full_name, password_hash, recovery_kit_id, recovery_kit_hash, recovery_kit_expires_at, updated_at
         FROM users WHERE email = $1`, [body.email]);
    if (!user)
        throw (0, errors_1.notFound)('No account was found for that email.');
    const kitCodeHashed = user.recovery_kit_hash ?? '';
    if (!kitCodeHashed || !(0, codes_1.safeEqual)(kitCodeHashed, (0, crypto_1.sha256Hex)(body.resetCode))) {
        throw (0, errors_1.badRequest)('That reset code is incorrect. Use your recovery kit key.');
    }
    const hash = await bcryptjs_1.default.hash(body.newPassword, 12);
    await (0, pool_1.query)(`UPDATE users SET password_hash = $2, password_changed_at = now(), updated_at = now() WHERE id = $1`, [user.id, hash]);
    // Vault erase step
    for (const table of ['vault_passwords', 'cards', 'notes', 'documents']) {
        await (0, pool_1.query)(`DELETE FROM ${table} WHERE user_id = $1`, [user.id]);
    }
    await (0, pool_1.query)(`DELETE FROM sessions WHERE user_id = $1`, [user.id]);
    await (0, pool_1.query)(`DELETE FROM biometric_credentials WHERE user_id = $1`, [user.id]);
    res.json({ message: 'Your account was recovered and the old vault was erased. Sign in with your new password.' });
}));
exports.default = router;
//# sourceMappingURL=recoveryKit.js.map