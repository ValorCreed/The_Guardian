import { Router } from 'express';
import { z } from 'zod';
import { createHash } from 'node:crypto';

import { asyncHandler, ApiError } from '../lib/errors';
import { query, row, rows } from '../db/pool';
import { requireAuth, type AuthedRequest } from '../middleware/auth';
import { getPlanForUser } from '../lib/plan';
import { encryptAtRest, decryptAtRest } from '../lib/crypto';
import { objectKey, writeEncryptedFile } from '../lib/storage';
import { createNotification } from '../services/notifications';

const router = Router({ mergeParams: true });

async function countTotals(userId: number) {
  const [pass, card, doc, fm] = await Promise.all([
    row<{ c: string }>('SELECT COUNT(*)::int AS c FROM vault_passwords WHERE user_id = $1', [userId]),
    row<{ c: string }>('SELECT COUNT(*)::int AS c FROM cards WHERE user_id = $1', [userId]),
    row<{ c: string }>('SELECT COUNT(*)::int AS c FROM documents WHERE user_id = $1', [userId]),
    row<{ c: string }>('SELECT COUNT(*)::int AS c FROM family_memberships WHERE owner_user_id = $1 AND member_user_id IS NOT NULL', [userId]),
  ]);
  return {
    passwordCount: Number(pass?.c ?? 0),
    cardCount: Number(card?.c ?? 0),
    documentCount: Number(doc?.c ?? 0),
    familyMemberCount: Number(fm?.c ?? 0),
  };
}

async function buildBackupPayload(userId: number) {
  const [passwords, cards, notes, documents, contacts] = await Promise.all([
    rows<object>(`SELECT title, website, username, password_enc, notes_enc, created_at, updated_at FROM vault_passwords WHERE user_id = $1`, [userId]),
    rows<object>(`SELECT card_name, card_number_enc, expiry_enc, cvv_enc, cardholder_enc, notes_enc, created_at, updated_at FROM cards WHERE user_id = $1`, [userId]),
    rows<object>(`SELECT title, content_enc, color, pinned, created_at, updated_at FROM notes WHERE user_id = $1`, [userId]),
    rows<object>(`SELECT title, file_name, mime_type, size_bytes, created_at, updated_at FROM documents WHERE user_id = $1`, [userId]),
    rows<object>(`SELECT name, email, phone, relationship, can_view_vault FROM emergency_contacts WHERE user_id = $1`, [userId]),
  ]);
  return { version: 1, exportedAt: new Date().toISOString(), passwords, cards, notes, documents, contacts };
}

router.get(
  '/status',
  requireAuth,
  asyncHandler(async (req: AuthedRequest, res) => {
    const plan = await getPlanForUser(Number(req.userId));
    const allowed = (plan === 'PREMIUM' || plan === 'FAMILY') && req.sessionMode !== 'DURESS';
    const totals = allowed ? await countTotals(Number(req.userId)) : { passwordCount: 0, cardCount: 0, documentCount: 0, familyMemberCount: 0 };
    res.json({
      allowed,
      plan,
      message: allowed ? 'Backup is available on your plan.' : 'Cloud backup is available on Premium and Family plans.',
      totalItemCount: totals.passwordCount + totals.cardCount + totals.documentCount + totals.familyMemberCount,
      ...totals,
    });
  })
);

router.post(
  '/create',
  requireAuth,
  asyncHandler(async (req: AuthedRequest, res) => {
    if (req.sessionMode === 'DURESS') throw new ApiError(403, 'Not available in this session.', 'FORBIDDEN');
    const plan = await getPlanForUser(Number(req.userId));
    if (plan === 'FREE') throw new ApiError(403, 'Cloud backup is available on Premium and Family plans.', 'PLAN_LIMIT_REACHED');

    const payload = await buildBackupPayload(Number(req.userId));
    const encryptedBackup = encryptAtRest(JSON.stringify(payload));
    const checksum = createHash('sha256').update(encryptedBackup).digest('hex');

    const key = objectKey('backup');
    await writeEncryptedFile(Number(req.userId), key, Buffer.from(encryptedBackup, 'utf8'));

    await query(`DELETE FROM backup_files WHERE user_id = $1 AND replaced = false`, [req.userId]);
    await query(
      `INSERT INTO backup_files (user_id, storage_key, size_bytes) VALUES ($1, $2, $3)`,
      [req.userId, key, Buffer.byteLength(encryptedBackup, 'utf8')]
    );

    const totals = await countTotals(Number(req.userId));
    const backupSizeBytes = Buffer.byteLength(encryptedBackup, 'utf8');

    await createNotification({
      userId: Number(req.userId),
      type: 'BACKUP_CREATED',
      title: 'Backup created',
      body: 'Your new encrypted backup is stored securely in the cloud.',
      route: '/backup',
    });

    res.status(201).json({
      fileName: `guardian-backup-${new Date().toISOString().slice(0, 10)}.gbak`,
      createdAt: payload.exportedAt,
      encryptedBackup,
      backupSizeBytes,
      checksum,
      message: 'Backup created successfully.',
      ...totals,
      totalItemCount: totals.passwordCount + totals.cardCount + totals.documentCount + totals.familyMemberCount,
    });
  })
);

router.post(
  '/restore',
  requireAuth,
  asyncHandler(async (req: AuthedRequest, res) => {
    if (req.sessionMode === 'DURESS') throw new ApiError(403, 'Not available in this session.', 'FORBIDDEN');
    const plan = await getPlanForUser(Number(req.userId));
    if (plan === 'FREE') throw new ApiError(403, 'Cloud backup is available on Premium and Family plans.', 'PLAN_LIMIT_REACHED');

    const body = z.object({ encryptedBackup: z.string().min(1), replaceExisting: z.boolean().optional() }).parse(req.body);

    let payload: ReturnType<typeof parsePayload>;
    try {
      payload = parsePayload(decryptAtRest(body.encryptedBackup));
    } catch {
      throw new ApiError(400, 'The backup payload could not be decrypted. It may be corrupt.', 'INVALID_BACKUP');
    }

    if (body.replaceExisting) {
      await query(`DELETE FROM vault_passwords WHERE user_id = $1`, [req.userId]);
      await query(`DELETE FROM cards WHERE user_id = $1`, [req.userId]);
      await query(`DELETE FROM notes WHERE user_id = $1`, [req.userId]);
    }

    let passwordCount = 0;
    let cardCount = 0;
    let documentCount = 0;

    for (const item of payload.passwords) {
      await query(
        `INSERT INTO vault_passwords (user_id, title, website, username, password_enc, notes_enc, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, now(), now())`,
        [req.userId, item.title ?? 'Untitled', item.website ?? null, item.username ?? null, item.password_enc ?? '', item.notes_enc ?? null]
      );
      passwordCount += 1;
    }
    for (const item of payload.cards) {
      await query(
        `INSERT INTO cards (user_id, card_name, card_number_enc, expiry_enc, cvv_enc, cardholder_enc, notes_enc, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, now(), now())`,
        [req.userId, item.card_name ?? '', item.card_number_enc ?? '', item.expiry_enc ?? null, item.cvv_enc ?? null, item.cardholder_enc ?? null, item.notes_enc ?? null]
      );
      cardCount += 1;
    }
    for (const item of payload.notes) {
      await query(
        `INSERT INTO notes (user_id, title, content_enc, color, pinned, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, now(), now())`,
        [req.userId, item.title ?? 'Untitled', item.content_enc ?? '', item.color ?? null, Boolean(item.pinned)]
      );
      documentCount += 1;
    }
    // Documents require their encrypted blobs, which are stored server-side; a
    // cloud backup therefore references document metadata only. Metadata is
    // restored so the vault listing stays consistent. If replaceExisting is
    // true the restored metadata replaces the previous list.
    if (body.replaceExisting) {
      await query(`DELETE FROM documents WHERE user_id = $1`, [req.userId]);
    }
    for (const item of payload.documents) {
      await query(
        `INSERT INTO documents (user_id, title, file_name, mime_type, size_bytes, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, now(), now())`,
        [req.userId, item.title ?? 'Untitled', item.file_name ?? 'document', item.mime_type ?? null, Number(item.size_bytes ?? 0)]
      );
      documentCount += 1;
    }

    await createNotification({
      userId: Number(req.userId),
      type: 'BACKUP_RESTORED',
      title: 'Backup restored',
      body: `Restored ${passwordCount + cardCount + documentCount} items from your backup.`,
      route: '/vault',
    });

    res.json({
      message: 'Backup restored successfully.',
      restoredAt: new Date().toISOString(),
      replaceExisting: Boolean(body.replaceExisting),
      restoredPasswordCount: passwordCount,
      restoredCardCount: cardCount,
      restoredDocumentCount: documentCount,
      totalRestoredCount: passwordCount + cardCount + documentCount,
    });
  })
);

function parsePayload(json: string) {
  const parsed = JSON.parse(json) as {
    version?: number;
    passwords?: Array<Record<string, unknown>>;
    cards?: Array<Record<string, unknown>>;
    notes?: Array<Record<string, unknown>>;
    documents?: Array<Record<string, unknown>>;
  };
  const as = <T>(v: Array<Record<string, unknown>> | undefined): T[] => (v ?? []) as T[];
  return {
    passwords: as<{ title?: string; website?: string | null; username?: string | null; password_enc?: string; notes_enc?: string | null }>(parsed.passwords),
    cards: as<{ card_name?: string | null; card_number_enc?: string; expiry_enc?: string | null; cvv_enc?: string | null; cardholder_enc?: string | null; notes_enc?: string | null }>(parsed.cards),
    notes: as<{ title?: string; content_enc?: string; color?: string | null; pinned?: boolean }>(parsed.notes),
    documents: as<{ title?: string; file_name?: string | null; mime_type?: string | null; size_bytes?: number }>(parsed.documents),
  };
}

export default router;