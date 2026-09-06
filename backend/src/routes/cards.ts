import { Router } from 'express';
import { z } from 'zod';

import { asyncHandler, notFound, ApiError } from '../lib/errors';
import { query, row, rows } from '../db/pool';
import { encryptAtRest, decryptAtRestSafe } from '../lib/crypto';
import { requireAuth, type AuthedRequest } from '../middleware/auth';
import { getPlanForUser } from '../lib/plan';

const router = Router({ mergeParams: true });

const FREE_CARD_LIMIT = 3;

const bodySchema = z.object({
  cardName: z.string().trim().min(1).max(200),
  encryptedCardNumber: z.string().max(100_000),
  encryptedExpiryDate: z.string().max(20_000),
  encryptedCvv: z.string().max(20_000),
  encryptedCardholderName: z.string().max(20_000).optional().nullable(),
  encryptedCardHolderName: z.string().max(20_000).optional().nullable(),
  encryptedNotes: z.string().max(100_000).optional().nullable(),
});

type CardRow = {
  id: number;
  card_name: string;
  card_number_enc: string;
  expiry_month: string | null;
  expiry_year: string | null;
  cardholder_name: string | null;
  notes_enc: string | null;
  expiry_enc: string | null;
  cvv_enc: string | null;
  created_at: Date;
  updated_at: Date;
};

function toCard(db: CardRow) {
  const cardHolder = decryptAtRestSafe(db.cardholder_name);
  const notes = decryptAtRestSafe(db.notes_enc);
  return {
    id: Number(db.id),
    cardName: db.card_name,
    encryptedCardNumber: decryptAtRestSafe(db.card_number_enc) ?? '',
    encryptedExpiryDate: decryptAtRestSafe(db.expiry_enc) ?? '',
    encryptedCvv: decryptAtRestSafe(db.cvv_enc) ?? '',
    encryptedCardholderName: cardHolder,
    encryptedCardHolderName: cardHolder,
    encryptedNotes: notes,
    createdAt: db.created_at.toISOString(),
    updatedAt: db.updated_at.toISOString(),
  };
}

router.get(
  '/',
  requireAuth,
  asyncHandler(async (req: AuthedRequest, res) => {
    if (req.sessionMode === 'DURESS') return res.json([]);
    const items = await rows<CardRow>(
      `SELECT id, card_name, card_number_enc, expiry_month, expiry_year,
              expiry_enc, cvv_enc, cardholder_name, notes_enc, created_at, updated_at
         FROM cards WHERE user_id = $1 ORDER BY updated_at DESC`,
      [req.userId]
    );
    res.json(items.map(toCard));
  })
);

router.get(
  '/:id',
  requireAuth,
  asyncHandler(async (req: AuthedRequest, res) => {
    if (req.sessionMode === 'DURESS') throw notFound();
    const item = await row<CardRow>(
      `SELECT id, card_name, card_number_enc, expiry_month, expiry_year,
              expiry_enc, cvv_enc, cardholder_name, notes_enc, created_at, updated_at
         FROM cards WHERE id = $1 AND user_id = $2`,
      [req.params.id, req.userId]
    );
    if (!item) throw notFound();
    res.json(toCard(item));
  })
);

router.post(
  '/',
  requireAuth,
  asyncHandler(async (req: AuthedRequest, res) => {
    if (req.sessionMode === 'DURESS') {
      res.status(201).json({ ...req.body, id: Math.floor(1e9 * Math.random()), createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
      return;
    }

    const body = bodySchema.parse(req.body);
    const plan = await getPlanForUser(Number(req.userId));

    if (plan === 'FREE') {
      const count = await row<{ count: string }>('SELECT COUNT(*)::int AS count FROM cards WHERE user_id = $1', [req.userId]);
      if (Number(count?.count ?? 0) >= FREE_CARD_LIMIT) {
        throw new ApiError(
          403,
          `Free accounts can save up to ${FREE_CARD_LIMIT} cards. Upgrade to Premium or Family for unlimited card storage.`,
          'PLAN_LIMIT_REACHED'
        );
      }
    }

    const holder = body.encryptedCardholderName ?? body.encryptedCardHolderName ?? null;
    const result = await row<CardRow>(
      `INSERT INTO cards (user_id, card_name, card_number_enc, expiry_enc, cvv_enc, cardholder_name, notes_enc)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id, card_name, card_number_enc, expiry_month, expiry_year,
                 expiry_enc, cvv_enc, cardholder_name, notes_enc, created_at, updated_at`,
      [
        req.userId,
        body.cardName,
        encryptAtRest(body.encryptedCardNumber),
        encryptAtRest(body.encryptedExpiryDate),
        encryptAtRest(body.encryptedCvv),
        holder ? encryptAtRest(holder) : '',
        body.encryptedNotes ? encryptAtRest(body.encryptedNotes) : null,
      ]
    );
    res.status(201).json(toCard(result!));
  })
);

router.put(
  '/:id',
  requireAuth,
  asyncHandler(async (req: AuthedRequest, res) => {
    const existing = await row<CardRow>(
      `SELECT id, card_name, card_number_enc, expiry_month, expiry_year,
              expiry_enc, cvv_enc, cardholder_name, notes_enc, created_at, updated_at
         FROM cards WHERE id = $1 AND user_id = $2`,
      [req.params.id, req.userId]
    );
    if (!existing) throw notFound();

    const body = bodySchema.partial().parse(req.body);
    const holder = body.encryptedCardholderName ?? body.encryptedCardHolderName;

    const result = await row<CardRow>(
      `UPDATE cards SET
          card_name = COALESCE($3, card_name),
          card_number_enc = COALESCE($4, card_number_enc),
          expiry_enc = COALESCE($5, expiry_enc),
          cvv_enc = COALESCE($6, cvv_enc),
          cardholder_name = COALESCE($7, cardholder_name),
          notes_enc = COALESCE($8, notes_enc),
          updated_at = now()
        WHERE id = $1 AND user_id = $2
        RETURNING id, card_name, card_number_enc, expiry_month, expiry_year,
                  expiry_enc, cvv_enc, cardholder_name, notes_enc, created_at, updated_at`,
      [
        req.params.id,
        req.userId,
        body.cardName ?? null,
        body.encryptedCardNumber ? encryptAtRest(body.encryptedCardNumber) : null,
        body.encryptedExpiryDate ? encryptAtRest(body.encryptedExpiryDate) : null,
        body.encryptedCvv ? encryptAtRest(body.encryptedCvv) : null,
        holder ? encryptAtRest(holder) : null,
        body.encryptedNotes ? encryptAtRest(body.encryptedNotes) : null,
      ]
    );
    res.json(toCard(result!));
  })
);

router.delete(
  '/:id',
  requireAuth,
  asyncHandler(async (req: AuthedRequest, res) => {
    if (req.sessionMode === 'DURESS') return res.status(204).send();
    await query('DELETE FROM cards WHERE id = $1 AND user_id = $2', [req.params.id, req.userId]);
    res.status(204).send();
  })
);

export default router;