"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const zod_1 = require("zod");
const errors_1 = require("../lib/errors");
const pool_1 = require("../db/pool");
const crypto_1 = require("../lib/crypto");
const auth_1 = require("../middleware/auth");
const plan_1 = require("../lib/plan");
const router = (0, express_1.Router)({ mergeParams: true });
const FREE_PASSWORD_LIMIT = 10;
const bodySchema = zod_1.z.object({
    itemType: zod_1.z.string().optional(),
    title: zod_1.z.string().trim().min(1).max(200),
    usernameValue: zod_1.z.string().trim().max(500).optional().nullable(),
    encryptedPassword: zod_1.z.string().max(100_000).optional().nullable(),
    encryptedData: zod_1.z.string().max(100_000).optional().nullable(),
    password: zod_1.z.string().max(100_000).optional().nullable(),
    website: zod_1.z.string().trim().max(1000).optional().nullable(),
    notes: zod_1.z.string().max(100_000).optional().nullable(),
});
function toVaultItem(db) {
    const password = (0, crypto_1.decryptAtRestSafe)(db.password_enc) ?? '';
    return {
        id: Number(db.id),
        itemType: 'PASSWORD',
        title: db.title,
        website: db.website ?? undefined,
        usernameValue: db.username_value ?? undefined,
        password,
        encryptedPassword: password,
        encryptedData: password,
        notes: (0, crypto_1.decryptAtRestSafe)(db.notes_enc) ?? undefined,
        createdAt: db.created_at.toISOString(),
        updatedAt: db.updated_at.toISOString(),
    };
}
function secretOf(body) {
    return body.encryptedPassword ?? body.encryptedData ?? body.password ?? '';
}
router.get('/', auth_1.requireAuth, (0, errors_1.asyncHandler)(async (req, res) => {
    if (req.sessionMode === 'DURESS')
        return res.json([]);
    const items = await (0, pool_1.rows)(`SELECT id, title, website, username AS username_value, password_enc, notes_enc, created_at, updated_at
         FROM vault_passwords WHERE user_id = $1 ORDER BY updated_at DESC`, [req.userId]);
    res.json(items.map(toVaultItem));
}));
router.get('/:id', auth_1.requireAuth, (0, errors_1.asyncHandler)(async (req, res) => {
    if (req.sessionMode === 'DURESS')
        throw (0, errors_1.notFound)();
    const item = await (0, pool_1.row)(`SELECT id, title, website, username AS username_value, password_enc, notes_enc, created_at, updated_at
         FROM vault_passwords WHERE id = $1 AND user_id = $2`, [req.params.id, req.userId]);
    if (!item)
        throw (0, errors_1.notFound)();
    res.json(toVaultItem(item));
}));
router.post('/', auth_1.requireAuth, (0, errors_1.asyncHandler)(async (req, res) => {
    if (req.sessionMode === 'DURESS') {
        res.status(201).json({
            ...req.body,
            id: Math.floor(1e9 * Math.random()),
            itemType: 'PASSWORD',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
        });
        return;
    }
    const body = bodySchema.parse(req.body);
    const plan = await (0, plan_1.getPlanForUser)(Number(req.userId));
    if (plan === 'FREE') {
        const count = await (0, pool_1.row)('SELECT COUNT(*)::int AS count FROM vault_passwords WHERE user_id = $1', [req.userId]);
        if (Number(count?.count ?? 0) >= FREE_PASSWORD_LIMIT) {
            throw new errors_1.ApiError(403, `Your Free plan can save up to ${FREE_PASSWORD_LIMIT} passwords. Upgrade to Premium or Family for unlimited password storage.`, 'PLAN_LIMIT_REACHED');
        }
    }
    const secret = secretOf(body);
    const result = await (0, pool_1.row)(`INSERT INTO vault_passwords (user_id, title, username, password_enc, notes_enc, website)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, title, website, username AS username_value, password_enc, notes_enc, created_at, updated_at`, [req.userId, body.title, body.usernameValue ?? null, (0, crypto_1.encryptAtRest)(secret), body.notes ? (0, crypto_1.encryptAtRest)(body.notes) : null, body.website ?? null]);
    res.status(201).json(toVaultItem(result));
}));
router.put('/:id', auth_1.requireAuth, (0, errors_1.asyncHandler)(async (req, res) => {
    const body = bodySchema.partial().parse(req.body);
    const existing = await (0, pool_1.row)(`SELECT id, title, website, username AS username_value, password_enc, notes_enc, created_at, updated_at
         FROM vault_passwords WHERE id = $1 AND user_id = $2`, [req.params.id, req.userId]);
    if (!existing)
        throw (0, errors_1.notFound)();
    const title = body.title ?? existing.title;
    const website = body.website !== undefined ? body.website : existing.website;
    const usernameValue = body.usernameValue !== undefined ? body.usernameValue : existing.username_value;
    const notes = body.notes !== undefined ? (body.notes ? (0, crypto_1.encryptAtRest)(body.notes) : null) : existing.notes_enc;
    const secret = body.encryptedPassword !== undefined || body.encryptedData !== undefined || body.password !== undefined
        ? (0, crypto_1.encryptAtRest)(secretOf(body))
        : existing.password_enc;
    const result = await (0, pool_1.row)(`UPDATE vault_passwords
          SET title = $3, website = $4, username = $5, password_enc = $6, notes_enc = $7, updated_at = now()
        WHERE id = $1 AND user_id = $2
        RETURNING id, title, website, username AS username_value, password_enc, notes_enc, created_at, updated_at`, [req.params.id, req.userId, title, website ?? null, usernameValue ?? null, secret, notes]);
    res.json(toVaultItem(result));
}));
router.delete('/:id', auth_1.requireAuth, (0, errors_1.asyncHandler)(async (req, res) => {
    if (req.sessionMode === 'DURESS')
        return res.status(204).send();
    await (0, pool_1.query)('DELETE FROM vault_passwords WHERE id = $1 AND user_id = $2', [req.params.id, req.userId]);
    res.status(204).send();
}));
exports.default = router;
//# sourceMappingURL=vaultItems.js.map