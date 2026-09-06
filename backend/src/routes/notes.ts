import { Router } from 'express';
import { z } from 'zod';

import { asyncHandler, notFound, ApiError } from '../lib/errors';
import { query, row, rows } from '../db/pool';
import { encryptAtRest, decryptAtRestSafe } from '../lib/crypto';
import { requireAuth, type AuthedRequest } from '../middleware/auth';
import { getPlanForUser } from '../lib/plan';

const router = Router({ mergeParams: true });

const FREE_NOTE_LIMIT = 5;

const bodySchema = z.object({
  title: z.string().trim().min(1).max(200),
  category: z.string().trim().max(60).nullable().optional(),
  encryptedContent: z.string().max(1_000_000),
  pinned: z.boolean().optional().default(false),
});

type NoteRow = {
  id: number;
  title: string;
  category: string | null;
  content_enc: string;
  pinned: boolean;
  created_at: Date;
  updated_at: Date;
};

function toNote(db: NoteRow) {
  return {
    id: Number(db.id),
    title: db.title,
    category: db.category,
    encryptedContent: decryptAtRestSafe(db.content_enc) ?? '',
    pinned: db.pinned,
    createdAt: db.created_at.toISOString(),
    updatedAt: db.updated_at.toISOString(),
  };
}

router.get(
  '/',
  requireAuth,
  asyncHandler(async (req: AuthedRequest, res) => {
    if (req.sessionMode === 'DURESS') return res.json([]);
    const items = await rows<NoteRow>(
      `SELECT id, title, category, content_enc, pinned, created_at, updated_at
         FROM notes WHERE user_id = $1 ORDER BY pinned DESC, updated_at DESC`,
      [req.userId]
    );
    res.json(items.map(toNote));
  })
);

router.get(
  '/:id',
  requireAuth,
  asyncHandler(async (req: AuthedRequest, res) => {
    if (req.sessionMode === 'DURESS') throw notFound();
    const item = await row<NoteRow>(
      `SELECT id, title, category, content_enc, pinned, created_at, updated_at
         FROM notes WHERE id = $1 AND user_id = $2`,
      [req.params.id, req.userId]
    );
    if (!item) throw notFound();
    res.json(toNote(item));
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
      const count = await row<{ count: string }>('SELECT COUNT(*)::int AS count FROM notes WHERE user_id = $1', [req.userId]);
      if (Number(count?.count ?? 0) >= FREE_NOTE_LIMIT) {
        throw new ApiError(
          403,
          `Free accounts can save up to ${FREE_NOTE_LIMIT} SecureNotes. Upgrade to Premium or Family for unlimited SecureNotes.`,
          'PLAN_LIMIT_REACHED'
        );
      }
    }

    const result = await row<NoteRow>(
      `INSERT INTO notes (user_id, title, category, content_enc, pinned)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, title, category, content_enc, pinned, created_at, updated_at`,
      [req.userId, body.title, body.category ?? null, encryptAtRest(body.encryptedContent), body.pinned]
    );
    res.status(201).json(toNote(result!));
  })
);

router.put(
  '/:id',
  requireAuth,
  asyncHandler(async (req: AuthedRequest, res) => {
    const body = bodySchema.partial().parse(req.body);
    const existing = await row<NoteRow>(
      `SELECT id, title, category, content_enc, pinned, created_at, updated_at
         FROM notes WHERE id = $1 AND user_id = $2`,
      [req.params.id, req.userId]
    );
    if (!existing) throw notFound();

    const result = await row<NoteRow>(
      `UPDATE notes SET
          title = COALESCE($3, title),
          category = $4,
          content_enc = COALESCE($5, content_enc),
          pinned = COALESCE($6, pinned),
          updated_at = now()
        WHERE id = $1 AND user_id = $2
        RETURNING id, title, category, content_enc, pinned, created_at, updated_at`,
      [
        req.params.id,
        req.userId,
        body.title ?? null,
        body.category !== undefined ? body.category : existing.category,
        body.encryptedContent ? encryptAtRest(body.encryptedContent) : null,
        body.pinned ?? null,
      ]
    );
    res.json(toNote(result!));
  })
);

router.delete(
  '/:id',
  requireAuth,
  asyncHandler(async (req: AuthedRequest, res) => {
    if (req.sessionMode === 'DURESS') return res.status(204).send();
    await query('DELETE FROM notes WHERE id = $1 AND user_id = $2', [req.params.id, req.userId]);
    res.status(204).send();
  })
);

export default router;