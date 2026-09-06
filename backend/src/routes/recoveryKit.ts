import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';

import { asyncHandler, notFound, forbidden, badRequest } from '../lib/errors';
import { query, row } from '../db/pool';
import { sha256Hex } from '../lib/crypto';
import { randomToken, safeEqual } from '../lib/codes';
import { requireAuth, type AuthedRequest } from '../middleware/auth';
import { requireFeature } from '../middleware/featureGate';
import { createNotification } from '../services/notifications';

const router = Router({ mergeParams: true });

type UserRow = {
  id: number;
  email: string;
  full_name: string;
  password_hash: string;
  recovery_kit_id: string | null;
  recovery_kit_hash: string | null;
  recovery_kit_expires_at: Date | null;
  updated_at: Date;
};

async function userById(id: number): Promise<UserRow | null> {
  return row<UserRow>(
    `SELECT id, email, full_name, password_hash, recovery_kit_id, recovery_kit_hash, recovery_kit_expires_at, updated_at
       FROM users WHERE id = $1`,
    [id]
  );
}

router.get(
  '/status',
  requireAuth,
  asyncHandler(async (req: AuthedRequest, res) => {
    if (req.sessionMode === 'DURESS') {
      return res.json({ created: false, recoveryId: null, createdAt: null, lastUsedAt: null });
    }
    await requireFeature(req, 'recoveryCircle');

    const user = await userById(Number(req.userId));
    if (!user) throw notFound();
    res.json({
      created: Boolean(user.recovery_kit_id),
      recoveryId: user.recovery_kit_id ?? null,
      createdAt: user.updated_at.toISOString(),
      lastUsedAt: user.updated_at.toISOString(),
    });
  })
);

router.post(
  '/generate',
  requireAuth,
  asyncHandler(async (req: AuthedRequest, res) => {
    if (req.sessionMode === 'DURESS') throw forbidden('Not available in this session.');
    await requireFeature(req, 'recoveryCircle');

    const body = z.object({ password: z.string().min(1).max(128) }).parse(req.body);
    const user = await userById(Number(req.userId));
    if (!user) throw notFound();
    if (!(await bcrypt.compare(body.password, user.password_hash))) {
      throw forbidden('Your current password is incorrect.');
    }

    const recoveryId = `GK-${randomToken(6).toUpperCase()}`;
    const recoveryKey = `RC-${randomToken(18)}`;
    await query(
      `UPDATE users
          SET recovery_kit_id = $2, recovery_kit_hash = $3,
              recovery_kit_expires_at = now() + interval '30 days',
              updated_at = now()
        WHERE id = $1`,
      [user.id, recoveryId, sha256Hex(recoveryKey)]
    );

    await createNotification({
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
  })
);

router.delete(
  '/',
  requireAuth,
  asyncHandler(async (req: AuthedRequest, res) => {
    await query(`UPDATE users SET recovery_kit_id = NULL, recovery_kit_hash = NULL, recovery_kit_expires_at = NULL, updated_at = now() WHERE id = $1`, [req.userId]);
    res.json({ message: 'Recovery kit revoked.' });
  })
);

async function resolveKit(recoveryId: string): Promise<UserRow> {
  const user = await row<UserRow>(
    `SELECT id, email, full_name, password_hash, recovery_kit_id, recovery_kit_hash, recovery_kit_expires_at, updated_at
       FROM users WHERE recovery_kit_id = $1`,
    [recoveryId.trim().toUpperCase()]
  );
  if (!user) throw notFound('No recovery kit found for that recovery ID.');
  return user;
}

router.post(
  '/reset-password',
  asyncHandler(async (req, res) => {
    const body = z
      .object({
        recoveryId: z.string().min(1).max(80),
        recoveryKey: z.string().min(1).max(300),
        newPassword: z.string().min(8).max(128),
      })
      .parse(req.body);

    const user = await resolveKit(body.recoveryId);
    if (!user.recovery_kit_hash) throw notFound('No recovery kit found for that recovery ID.');
    if (user.recovery_kit_expires_at && user.recovery_kit_expires_at.getTime() < Date.now()) {
      throw forbidden('This recovery kit has expired. Generate a new one.');
    }
    if (!safeEqual(user.recovery_kit_hash, sha256Hex(body.recoveryKey))) {
      throw badRequest('The recovery key is incorrect.');
    }

    const hash = await bcrypt.hash(body.newPassword, 12);
    await query(`UPDATE users SET password_hash = $2, password_changed_at = now(), updated_at = now() WHERE id = $1`, [user.id, hash]);
    await query(`DELETE FROM biometric_credentials WHERE user_id = $1`, [user.id]);

    res.json({ message: 'Your password was recovered with the recovery kit. Please sign in.' });
  })
);

router.post(
  '/reset-account',
  asyncHandler(async (req, res) => {
    const body = z
      .object({
        email: z.string().trim().toLowerCase().email(),
        resetCode: z.string().min(1).max(80),
        newPassword: z.string().min(8).max(128),
      })
      .parse(req.body);

    const user = await row<UserRow>(
      `SELECT id, email, full_name, password_hash, recovery_kit_id, recovery_kit_hash, recovery_kit_expires_at, updated_at
         FROM users WHERE email = $1`,
      [body.email]
    );
    if (!user) throw notFound('No account was found for that email.');

    const kitCodeHashed = user.recovery_kit_hash ?? '';
    if (!kitCodeHashed || !safeEqual(kitCodeHashed, sha256Hex(body.resetCode))) {
      throw badRequest('That reset code is incorrect. Use your recovery kit key.');
    }

    const hash = await bcrypt.hash(body.newPassword, 12);
    await query(`UPDATE users SET password_hash = $2, password_changed_at = now(), updated_at = now() WHERE id = $1`, [user.id, hash]);

    // Vault erase step
    for (const table of ['vault_passwords', 'cards', 'notes', 'documents']) {
      await query(`DELETE FROM ${table} WHERE user_id = $1`, [user.id]);
    }
    await query(`DELETE FROM sessions WHERE user_id = $1`, [user.id]);
    await query(`DELETE FROM biometric_credentials WHERE user_id = $1`, [user.id]);

    res.json({ message: 'Your account was recovered and the old vault was erased. Sign in with your new password.' });
  })
);

export default router;