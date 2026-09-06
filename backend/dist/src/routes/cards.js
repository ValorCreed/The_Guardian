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
const FREE_CARD_LIMIT = 3;
const bodySchema = zod_1.z.object({
    cardName: zod_1.z.string().trim().min(1).max(200),
    encryptedCardNumber: zod_1.z.string().max(100_000),
    encryptedExpiryDate: zod_1.z.string().max(20_000),
    encryptedCvv: zod_1.z.string().max(20_000),
    encryptedCardholderName: zod_1.z.string().max(20_000).optional().nullable(),
    encryptedCardHolderName: zod_1.z.string().max(20_000).optional().nullable(),
    encryptedNotes: zod_1.z.string().max(100_000).optional().nullable(),
});
function toCard(db) {
    const cardHolder = (0, crypto_1.decryptAtRestSafe)(db.cardholder_name);
    const notes = (0, crypto_1.decryptAtRestSafe)(db.notes_enc);
    return {
        id: Number(db.id),
        cardName: db.card_name,
        encryptedCardNumber: (0, crypto_1.decryptAtRestSafe)(db.card_number_enc) ?? '',
        encryptedExpiryDate: (0, crypto_1.decryptAtRestSafe)(db.expiry_enc) ?? '',
        encryptedCvv: (0, crypto_1.decryptAtRestSafe)(db.cvv_enc) ?? '',
        encryptedCardholderName: cardHolder,
        encryptedCardHolderName: cardHolder,
        encryptedNotes: notes,
        createdAt: db.created_at.toISOString(),
        updatedAt: db.updated_at.toISOString(),
    };
}
router.get('/', auth_1.requireAuth, (0, errors_1.asyncHandler)(async (req, res) => {
    if (req.sessionMode === 'DURESS')
        return res.json([]);
    const items = await (0, pool_1.rows)(`SELECT id, card_name, card_number_enc, expiry_month, expiry_year,
              expiry_enc, cvv_enc, cardholder_name, notes_enc, created_at, updated_at
         FROM cards WHERE user_id = $1 ORDER BY updated_at DESC`, [req.userId]);
    res.json(items.map(toCard));
}));
router.get('/:id', auth_1.requireAuth, (0, errors_1.asyncHandler)(async (req, res) => {
    if (req.sessionMode === 'DURESS')
        throw (0, errors_1.notFound)();
    const item = await (0, pool_1.row)(`SELECT id, card_name, card_number_enc, expiry_month, expiry_year,
              expiry_enc, cvv_enc, cardholder_name, notes_enc, created_at, updated_at
         FROM cards WHERE id = $1 AND user_id = $2`, [req.params.id, req.userId]);
    if (!item)
        throw (0, errors_1.notFound)();
    res.json(toCard(item));
}));
router.post('/', auth_1.requireAuth, (0, errors_1.asyncHandler)(async (req, res) => {
    if (req.sessionMode === 'DURESS') {
        res.status(201).json({ ...req.body, id: Math.floor(1e9 * Math.random()), createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
        return;
    }
    const body = bodySchema.parse(req.body);
    const plan = await (0, plan_1.getPlanForUser)(Number(req.userId));
    if (plan === 'FREE') {
        const count = await (0, pool_1.row)('SELECT COUNT(*)::int AS count FROM cards WHERE user_id = $1', [req.userId]);
        if (Number(count?.count ?? 0) >= FREE_CARD_LIMIT) {
            throw new errors_1.ApiError(403, `Free accounts can save up to ${FREE_CARD_LIMIT} cards. Upgrade to Premium or Family for unlimited card storage.`, 'PLAN_LIMIT_REACHED');
        }
    }
    const holder = body.encryptedCardholderName ?? body.encryptedCardHolderName ?? null;
    const result = await (0, pool_1.row)(`INSERT INTO cards (user_id, card_name, card_number_enc, expiry_enc, cvv_enc, cardholder_name, notes_enc)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id, card_name, card_number_enc, expiry_month, expiry_year,
                 expiry_enc, cvv_enc, cardholder_name, notes_enc, created_at, updated_at`, [
        req.userId,
        body.cardName,
        (0, crypto_1.encryptAtRest)(body.encryptedCardNumber),
        (0, crypto_1.encryptAtRest)(body.encryptedExpiryDate),
        (0, crypto_1.encryptAtRest)(body.encryptedCvv),
        holder ? (0, crypto_1.encryptAtRest)(holder) : '',
        body.encryptedNotes ? (0, crypto_1.encryptAtRest)(body.encryptedNotes) : null,
    ]);
    res.status(201).json(toCard(result));
}));
router.put('/:id', auth_1.requireAuth, (0, errors_1.asyncHandler)(async (req, res) => {
    const existing = await (0, pool_1.row)(`SELECT id, card_name, card_number_enc, expiry_month, expiry_year,
              expiry_enc, cvv_enc, cardholder_name, notes_enc, created_at, updated_at
         FROM cards WHERE id = $1 AND user_id = $2`, [req.params.id, req.userId]);
    if (!existing)
        throw (0, errors_1.notFound)();
    const body = bodySchema.partial().parse(req.body);
    const holder = body.encryptedCardholderName ?? body.encryptedCardHolderName;
    const result = await (0, pool_1.row)(`UPDATE cards SET
          card_name = COALESCE($3, card_name),
          card_number_enc = COALESCE($4, card_number_enc),
          expiry_enc = COALESCE($5, expiry_enc),
          cvv_enc = COALESCE($6, cvv_enc),
          cardholder_name = COALESCE($7, cardholder_name),
          notes_enc = COALESCE($8, notes_enc),
          updated_at = now()
        WHERE id = $1 AND user_id = $2
        RETURNING id, card_name, card_number_enc, expiry_month, expiry_year,
                  expiry_enc, cvv_enc, cardholder_name, notes_enc, created_at, updated_at`, [
        req.params.id,
        req.userId,
        body.cardName ?? null,
        body.encryptedCardNumber ? (0, crypto_1.encryptAtRest)(body.encryptedCardNumber) : null,
        body.encryptedExpiryDate ? (0, crypto_1.encryptAtRest)(body.encryptedExpiryDate) : null,
        body.encryptedCvv ? (0, crypto_1.encryptAtRest)(body.encryptedCvv) : null,
        holder ? (0, crypto_1.encryptAtRest)(holder) : null,
        body.encryptedNotes ? (0, crypto_1.encryptAtRest)(body.encryptedNotes) : null,
    ]);
    res.json(toCard(result));
}));
router.delete('/:id', auth_1.requireAuth, (0, errors_1.asyncHandler)(async (req, res) => {
    if (req.sessionMode === 'DURESS')
        return res.status(204).send();
    await (0, pool_1.query)('DELETE FROM cards WHERE id = $1 AND user_id = $2', [req.params.id, req.userId]);
    res.status(204).send();
}));
exports.default = router;
//# sourceMappingURL=cards.js.map