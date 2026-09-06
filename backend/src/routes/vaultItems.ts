import { Router, type Response } from 'express';
import { z } from 'zod';

import { asyncHandler, notFound, ApiError } from '../lib/errors';
import { query, row, rows } from '../db/pool';
import { encryptAtRest, decryptAtRestSafe } from '../lib/crypto';
import { requireAuth, type AuthedRequest } from '../middleware/auth';
import { getPlanForUser } from '../lib/plan';

const router = Router({ mergeParams: true });

const FREE_PASSWORD_LIMIT = 10;

const bodySchema = z.object({
  itemType: z.string().optional(),
  title: z.string().trim().min(1).max(200),
  usernameValue: z.string().trim().max(500).optional().nullable(),
  encryptedPassword: z.string().max(100_000).optional().nullable(),
  encryptedData: z.string().max(100_000).optional().nullable(),
  password: z.string().max(100_000).optional().nullable(),
  website: z.string().trim().max(1000).optional().nullable(),
  notes: z.string().max(100_000).optional().nullable(),
});

interface PasswordRow {
  id: number;
  title: string;
  website: string | null;
  username_value: string | null;
  password_enc: string;
  notes_enc: string | null;
  created_at: Date;
  updated_at: Date;
}

function toVaultItem(db: PasswordRow) {
  const password = decryptAtRestSafe(db.password_enc) ?? '';
  return {
    id: Number(db.id),
    itemType: 'PASSWORD',
    title: db.title,
    website: db.website ?? undefined,
    usernameValue: db.username_value ?? undefined,
    password,
    encryptedPassword: password,
    encryptedData: password,
    notes: decryptAtRestSafe(db.notes_enc) ?? undefined,
    createdAt: db.created_at.toISOString(),
    updatedAt: db.updated_at.toISOString(),
  };
}

function secretOf(body: z.infer<typeof bodySchema>): string {
  return body.encryptedPassword ?? body.encryptedData ?? body.password ?? '';
}

router.get(
  '/',
  requireAuth,
  asyncHandler(async (req: AuthedRequest, res: Response) => {
    if (req.sessionMode === 'DURESS') return res.json([]);

    const items = await rows<PasswordRow>(
      `SELECT id, title, website, username AS username_value, password_enc, notes_enc, created_at, updated_at
         FROM vault_passwords WHERE user_id = $1 ORDER BY updated_at DESC`,
      [req.userId]
    );
    res.json(items.map(toVaultItem));
  })
);

router.get(
  '/:id',
  requireAuth,
  asyncHandler(async (req: AuthedRequest, res: Response) => {
    if (req.sessionMode === 'DURESS') throw notFound();

    const item = await row<PasswordRow>(
      `SELECT id, title, website, username AS username_value, password_enc, notes_enc, created_at, updated_at
         FROM vault_passwords WHERE id = $1 AND user_id = $2`,
      [req.params.id, req.userId]
    );
    if (!item) throw notFound();
    res.json(toVaultItem(item));
  })
);

router.post(
  '/',
  requireAuth,
  asyncHandler(async (req: AuthedRequest, res: Response) => {
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
    const plan = await getPlanForUser(Number(req.userId));

    if (plan === 'FREE') {
      const count = await row<{ count: string }>(
        'SELECT COUNT(*)::int AS count FROM vault_passwords WHERE user_id = $1',
        [req.userId]
      );
      if (Number(count?.count ?? 0) >= FREE_PASSWORD_LIMIT) {
        throw new ApiError(
          403,
          `Your Free plan can save up to ${FREE_PASSWORD_LIMIT} passwords. Upgrade to Premium or Family for unlimited password storage.`,
          'PLAN_LIMIT_REACHED'
        );
      }
    }

    const secret = secretOf(body);
    const result = await row<PasswordRow>(
      `INSERT INTO vault_passwords (user_id, title, username, password_enc, notes_enc, website)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, title, website, username AS username_value, password_enc, notes_enc, created_at, updated_at`,
      [req.userId, body.title, body.usernameValue ?? null, encryptAtRest(secret), body.notes ? encryptAtRest(body.notes) : null, body.website ?? null]
    );
    res.status(201).json(toVaultItem(result!));
  })
);

router.put(
  '/:id',
  requireAuth,
  asyncHandler(async (req: AuthedRequest, res: Response) => {
    const body = bodySchema.partial().parse(req.body);

    const existing = await row<PasswordRow>(
      `SELECT id, title, website, username AS username_value, password_enc, notes_enc, created_at, updated_at
         FROM vault_passwords WHERE id = $1 AND user_id = $2`,
      [req.params.id, req.userId]
    );
    if (!existing) throw notFound();

    const title = body.title ?? existing.title;
    const website = body.website !== undefined ? body.website : existing.website;
    const usernameValue = body.usernameValue !== undefined ? body.usernameValue : existing.username_value;
    const notes = body.notes !== undefined ? (body.notes ? encryptAtRest(body.notes) : null) : existing.notes_enc;
    const secret =
      body.encryptedPassword !== undefined || body.encryptedData !== undefined || body.password !== undefined
        ? encryptAtRest(secretOf(body as z.infer<typeof bodySchema>))
        : existing.password_enc;

    const result = await row<PasswordRow>(
      `UPDATE vault_passwords
          SET title = $3, website = $4, username = $5, password_enc = $6, notes_enc = $7, updated_at = now()
        WHERE id = $1 AND user_id = $2
        RETURNING id, title, website, username AS username_value, password_enc, notes_enc, created_at, updated_at`,
      [req.params.id, req.userId, title, website ?? null, usernameValue ?? null, secret, notes]
    );
    res.json(toVaultItem(result!));
  })
);

router.delete(
  '/:id',
  requireAuth,
  asyncHandler(async (req: AuthedRequest, res: Response) => {
    if (req.sessionMode === 'DURESS') return res.status(204).send();

    await query('DELETE FROM vault_passwords WHERE id = $1 AND user_id = $2', [req.params.id, req.userId]);
    res.status(204).send();
  })
);

export default router;