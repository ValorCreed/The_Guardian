import { Router } from 'express';
import { z } from 'zod';
import bcrypt from 'bcryptjs';

import { asyncHandler, notFound, ApiError } from '../lib/errors';
import { query, row } from '../db/pool';
import { requireAuth, type AuthedRequest } from '../middleware/auth';
import { clearVaultState } from '../db/schema';

const router = Router({ mergeParams: true });

type UserRow = {
  id: number;
  email: string;
  full_name: string;
  password_hash: string;
  plan: string;
};

router.get(
  '/me',
  requireAuth,
  asyncHandler(async (req: AuthedRequest, res) => {
    const user = await row<{ id: number; email: string; full_name: string }>(
      'SELECT id, email, full_name FROM users WHERE id = $1',
      [req.userId]
    );
    if (!user) throw notFound();
    res.json({ userId: Number(user.id), fullName: user.full_name || 'Guardian User', email: user.email });
  })
);

router.put(
  '/me/profile',
  requireAuth,
  asyncHandler(async (req: AuthedRequest, res) => {
    const body = z.object({ fullName: z.string().trim().min(1).max(120) }).parse(req.body);
    const user = await row<UserRow>(
      `UPDATE users SET full_name = $2, updated_at = now() WHERE id = $1 RETURNING id, email, full_name`,
      [req.userId, body.fullName]
    );
    res.json({ userId: Number(user!.id), fullName: user!.full_name, email: user!.email });
  })
);

router.delete(
  '/me',
  requireAuth,
  asyncHandler(async (req: AuthedRequest, res) => {
    const body = z.object({ password: z.string().min(1) }).parse(req.body);

    const user = await row<UserRow>('SELECT * FROM users WHERE id = $1', [req.userId]);
    if (!user) throw notFound();
    const ok = await bcrypt.compare(body.password, user.password_hash);
    if (!ok) throw new ApiError(401, 'Password is incorrect.', 'INVALID_CREDENTIALS');

    await query(`INSERT INTO deleted_accounts (user_id, email) VALUES ($1, $2)`, [user.id, user.email]);
    await clearVaultState(Number(req.userId));
    await query(`DELETE FROM users WHERE id = $1`, [req.userId]);

    res.json({ message: 'Your account and all associated data have been deleted.' });
  })
);

export default router;