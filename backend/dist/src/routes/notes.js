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
const FREE_NOTE_LIMIT = 5;
const bodySchema = zod_1.z.object({
    title: zod_1.z.string().trim().min(1).max(200),
    category: zod_1.z.string().trim().max(60).nullable().optional(),
    encryptedContent: zod_1.z.string().max(1_000_000),
    pinned: zod_1.z.boolean().optional().default(false),
});
function toNote(db) {
    return {
        id: Number(db.id),
        title: db.title,
        category: db.category,
        encryptedContent: (0, crypto_1.decryptAtRestSafe)(db.content_enc) ?? '',
        pinned: db.pinned,
        createdAt: db.created_at.toISOString(),
        updatedAt: db.updated_at.toISOString(),
    };
}
router.get('/', auth_1.requireAuth, (0, errors_1.asyncHandler)(async (req, res) => {
    if (req.sessionMode === 'DURESS')
        return res.json([]);
    const items = await (0, pool_1.rows)(`SELECT id, title, category, content_enc, pinned, created_at, updated_at
         FROM notes WHERE user_id = $1 ORDER BY pinned DESC, updated_at DESC`, [req.userId]);
    res.json(items.map(toNote));
}));
router.get('/:id', auth_1.requireAuth, (0, errors_1.asyncHandler)(async (req, res) => {
    if (req.sessionMode === 'DURESS')
        throw (0, errors_1.notFound)();
    const item = await (0, pool_1.row)(`SELECT id, title, category, content_enc, pinned, created_at, updated_at
         FROM notes WHERE id = $1 AND user_id = $2`, [req.params.id, req.userId]);
    if (!item)
        throw (0, errors_1.notFound)();
    res.json(toNote(item));
}));
router.post('/', auth_1.requireAuth, (0, errors_1.asyncHandler)(async (req, res) => {
    if (req.sessionMode === 'DURESS') {
        res.status(201).json({ ...req.body, id: Math.floor(1e9 * Math.random()), createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
        return;
    }
    const body = bodySchema.parse(req.body);
    const plan = await (0, plan_1.getPlanForUser)(Number(req.userId));
    if (plan === 'FREE') {
        const count = await (0, pool_1.row)('SELECT COUNT(*)::int AS count FROM notes WHERE user_id = $1', [req.userId]);
        if (Number(count?.count ?? 0) >= FREE_NOTE_LIMIT) {
            throw new errors_1.ApiError(403, `Free accounts can save up to ${FREE_NOTE_LIMIT} SecureNotes. Upgrade to Premium or Family for unlimited SecureNotes.`, 'PLAN_LIMIT_REACHED');
        }
    }
    const result = await (0, pool_1.row)(`INSERT INTO notes (user_id, title, category, content_enc, pinned)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, title, category, content_enc, pinned, created_at, updated_at`, [req.userId, body.title, body.category ?? null, (0, crypto_1.encryptAtRest)(body.encryptedContent), body.pinned]);
    res.status(201).json(toNote(result));
}));
router.put('/:id', auth_1.requireAuth, (0, errors_1.asyncHandler)(async (req, res) => {
    const body = bodySchema.partial().parse(req.body);
    const existing = await (0, pool_1.row)(`SELECT id, title, category, content_enc, pinned, created_at, updated_at
         FROM notes WHERE id = $1 AND user_id = $2`, [req.params.id, req.userId]);
    if (!existing)
        throw (0, errors_1.notFound)();
    const result = await (0, pool_1.row)(`UPDATE notes SET
          title = COALESCE($3, title),
          category = $4,
          content_enc = COALESCE($5, content_enc),
          pinned = COALESCE($6, pinned),
          updated_at = now()
        WHERE id = $1 AND user_id = $2
        RETURNING id, title, category, content_enc, pinned, created_at, updated_at`, [
        req.params.id,
        req.userId,
        body.title ?? null,
        body.category !== undefined ? body.category : existing.category,
        body.encryptedContent ? (0, crypto_1.encryptAtRest)(body.encryptedContent) : null,
        body.pinned ?? null,
    ]);
    res.json(toNote(result));
}));
router.delete('/:id', auth_1.requireAuth, (0, errors_1.asyncHandler)(async (req, res) => {
    if (req.sessionMode === 'DURESS')
        return res.status(204).send();
    await (0, pool_1.query)('DELETE FROM notes WHERE id = $1 AND user_id = $2', [req.params.id, req.userId]);
    res.status(204).send();
}));
exports.default = router;
//# sourceMappingURL=notes.js.map