import { Router } from 'express';
import { z } from 'zod';

import { asyncHandler, notFound, forbidden, ApiError } from '../lib/errors';
import { query, row, rows } from '../db/pool';
import { requireAuth, type AuthedRequest } from '../middleware/auth';
import { getPlanForUser } from '../lib/plan';
import { decryptAtRestSafe } from '../lib/crypto';
import { readEncryptedFile } from '../lib/storage';

const router = Router({ mergeParams: true });

type PlaybookRow = {
  id: number;
  user_id: number;
  title: string;
  will_text_enc: string | null;
  guardian_binaries: unknown;
  trigger_config: unknown;
  release_after_days: number;
  status: string;
  created_at: Date;
  updated_at: Date;
};

type ExecutionRow = {
  id: number;
  playbook_id: number;
  user_id: number;
  recipient_user_id: number | null;
  item_type: string;
  item_id: number;
  item_title: string;
  action_type: string;
  source_type: string;
  status: string;
  released_at: Date;
  viewed_at: Date | null;
  completed_at: Date | null;
  cancelled_at: Date | null;
};

const bodySchema = z.object({
  itemType: z.enum(['PASSWORD', 'CARD', 'DOCUMENT', 'NOTE']),
  itemId: z.number().int().positive(),
  actionType: z.enum(['RELEASE', 'TRANSFER', 'CANCEL', 'DELETE', 'ARCHIVE']),
  triggerType: z.enum(['OWNER_RELEASE', 'EMERGENCY_APPROVAL', 'SAFETY_CHECK']).default('OWNER_RELEASE'),
  recipientContactId: z.number().int().positive().nullable().optional(),
  instructions: z.string().max(2000).optional().nullable(),
});

const ITEM_TABLE: Record<string, string> = {
  PASSWORD: 'vault_passwords',
  CARD: 'cards',
  DOCUMENT: 'documents',
  NOTE: 'notes',
};

async function titleFor(itemType: string, itemId: number): Promise<string> {
  const table = ITEM_TABLE[itemType];
  if (!table) return 'Item';
  const r = await row<{ title: string }>(`SELECT title FROM ${table} WHERE id = $1`, [itemId]);
  return r?.title ?? 'Item';
}

async function ownerPlaybook(req: AuthedRequest, id: string): Promise<PlaybookRow> {
  const p = await row<PlaybookRow>(
    `SELECT * FROM estate_playbooks WHERE id = $1 AND user_id = $2`,
    [id, req.userId]
  );
  if (!p) throw notFound('No estate playbook found.');
  return p;
}

function toPlaybook(p: PlaybookRow) {
  const config = (p.trigger_config ?? {}) as {
    itemType?: string;
    itemId?: number;
    actionType?: string;
    triggerType?: string;
    recipientContactId?: number | null;
    instructions?: string | null;
  };
  return {
    id: Number(p.id),
    itemType: config.itemType ?? 'NOTE',
    itemId: Number(config.itemId ?? p.id),
    itemTitle: p.title,
    actionType: config.actionType ?? 'RELEASE',
    triggerType: config.triggerType ?? 'OWNER_RELEASE',
    recipientContactId: config.recipientContactId ?? null,
    recipientUserId: null,
    recipientName: null,
    recipientEmail: null,
    instructions: config.instructions ?? '',
    status: p.status,
    itemAvailable: true,
    createdAt: p.created_at.toISOString(),
    updatedAt: p.updated_at.toISOString(),
  };
}

async function toExecution(e: ExecutionRow, forRecipient: boolean) {
  const owner = await row<{ full_name: string; email: string }>('SELECT full_name, email FROM users WHERE id = $1', [e.user_id]);
  const recipient = e.recipient_user_id
    ? await row<{ full_name: string; email: string }>('SELECT full_name, email FROM users WHERE id = $1', [e.recipient_user_id])
    : null;
  return {
    id: Number(e.id),
    playbookId: Number(e.playbook_id),
    ownerName: owner?.full_name ?? '',
    ownerEmail: owner?.email ?? '',
    recipientName: recipient?.full_name ?? (forRecipient ? 'You' : ''),
    recipientEmail: recipient?.email ?? '',
    itemType: e.item_type,
    itemId: Number(e.item_id),
    itemTitle: e.item_title,
    actionType: e.action_type,
    sourceType: e.source_type,
    status: e.status,
    instructions: '',
    itemAvailable: true,
    canOpen: e.status === 'RELEASED',
    canCancel: !forRecipient,
    canComplete: e.status === 'RELEASED' || e.status === 'VIEWED',
    releasedAt: e.released_at.toISOString(),
    viewedAt: e.viewed_at ? e.viewed_at.toISOString() : null,
    completedAt: e.completed_at ? e.completed_at.toISOString() : null,
    cancelledAt: e.cancelled_at ? e.cancelled_at.toISOString() : null,
  };
}

router.get(
  '/',
  requireAuth,
  asyncHandler(async (req: AuthedRequest, res) => {
    if (req.sessionMode === 'DURESS') {
      return res.json({ plan: 'FREE', eligible: false, canConfigure: false, vaultAvailable: false, contacts: [], vaultItems: [], playbooks: [], releasedByMe: [], received: [], message: 'Unavailable in this session.' });
    }
    const plan = await getPlanForUser(Number(req.userId));
    const eligible = plan === 'FAMILY';

    const contacts = await rows<{ id: number; name: string; email: string | null; relationship: string | null }>(
      `SELECT id, name, email, relationship FROM emergency_contacts WHERE user_id = $1 AND email IS NOT NULL`,
      [req.userId]
    );
    const vaultItems = await rows<{ table: string; id: number; title: string; updated_at: Date }>(
      `SELECT 'PASSWORD' AS table, id, title, updated_at FROM vault_passwords WHERE user_id = $1
       UNION ALL SELECT 'CARD', id, card_name, updated_at FROM cards WHERE user_id = $1
       UNION ALL SELECT 'DOCUMENT', id, title, updated_at FROM documents WHERE user_id = $1
       UNION ALL SELECT 'NOTE', id, title, updated_at FROM notes WHERE user_id = $1`,
      [req.userId]
    );
    const playbooks = await rows<PlaybookRow>('SELECT * FROM estate_playbooks WHERE user_id = $1 ORDER BY updated_at DESC', [req.userId]);

    const releasedByMe = await rows<ExecutionRow>('SELECT * FROM estate_executions WHERE user_id = $1 ORDER BY released_at DESC', [req.userId]);
    const received = await rows<ExecutionRow>(
      `SELECT * FROM estate_executions WHERE recipient_user_id = $1 ORDER BY released_at DESC`,
      [req.userId]
    );

    res.json({
      plan,
      eligible,
      canConfigure: eligible,
      vaultAvailable: true,
      contacts: contacts.map((c) => ({
        contactId: Number(c.id),
        userId: Number(c.id),
        name: c.name,
        email: c.email ?? '',
        relationship: c.relationship ?? '',
        registered: true,
        active: true,
        allowPasswords: true,
        allowCards: true,
        allowDocuments: true,
        allowNotes: true,
      })),
      vaultItems: vaultItems.map((v) => ({ id: Number(v.id), itemType: v.table, title: v.title, updatedAt: v.updated_at.toISOString() })),
      playbooks: playbooks.map(toPlaybook),
      releasedByMe: await Promise.all(releasedByMe.map((e) => toExecution(e, false))),
      received: await Promise.all(received.map((e) => toExecution(e, true))),
      message: eligible ? 'Estate playbooks ready.' : 'Estate planning is available on the Family plan.',
    });
  })
);

router.post(
  '/',
  requireAuth,
  asyncHandler(async (req: AuthedRequest, res) => {
    if (req.sessionMode === 'DURESS') throw forbidden('Not available in this session.');
    const plan = await getPlanForUser(Number(req.userId));
    if (plan !== 'FAMILY') throw new ApiError(403, 'Estate planning is available on the Family plan.', 'PLAN_LIMIT_REACHED');

    const body = bodySchema.parse(req.body);
    const itemTitle = await titleFor(body.itemType, body.itemId);

    const p = await row<PlaybookRow>(
      `INSERT INTO estate_playbooks (user_id, title, trigger_config, release_after_days, status)
       VALUES ($1, $2, $3, 30, 'ACTIVE')
       RETURNING *`,
      [req.userId, `${body.actionType} ${itemTitle}`, JSON.stringify({ itemType: body.itemType, itemId: body.itemId, actionType: body.actionType, triggerType: body.triggerType, recipientContactId: body.recipientContactId ?? null, instructions: body.instructions ?? null })]
    );
    res.status(201).json(toPlaybook(p!));
  })
);

router.get(
  '/:id',
  requireAuth,
  asyncHandler(async (req: AuthedRequest, res) => {
    const p = await ownerPlaybook(req, req.params.id);
    res.json(toPlaybook(p));
  })
);

router.put(
  '/:id',
  requireAuth,
  asyncHandler(async (req: AuthedRequest, res) => {
    const existing = await ownerPlaybook(req, req.params.id);
    const body = z.object({ status: z.enum(['ACTIVE', 'PAUSED']).optional() }).parse(req.body);
    const p = await row<PlaybookRow>(
      `UPDATE estate_playbooks SET status = COALESCE($2, status), updated_at = now()
        WHERE id = $1 RETURNING *`,
      [existing.id, body.status ?? null]
    );
    res.json(toPlaybook(p!));
  })
);

router.delete(
  '/:id',
  requireAuth,
  asyncHandler(async (req: AuthedRequest, res) => {
    await ownerPlaybook(req, req.params.id);
    await query('DELETE FROM estate_playbooks WHERE id = $1', [req.params.id]);
    res.status(204).send();
  })
);

router.post(
  '/:id/pause',
  requireAuth,
  asyncHandler(async (req: AuthedRequest, res) => {
    const existing = await ownerPlaybook(req, req.params.id);
    const p = await row<PlaybookRow>(`UPDATE estate_playbooks SET status = 'PAUSED', updated_at = now() WHERE id = $1 RETURNING *`, [existing.id]);
    res.json(toPlaybook(p!));
  })
);

router.post(
  '/:id/resume',
  requireAuth,
  asyncHandler(async (req: AuthedRequest, res) => {
    const existing = await ownerPlaybook(req, req.params.id);
    const p = await row<PlaybookRow>(`UPDATE estate_playbooks SET status = 'ACTIVE', updated_at = now() WHERE id = $1 RETURNING *`, [existing.id]);
    res.json(toPlaybook(p!));
  })
);

router.post(
  '/:id/release',
  requireAuth,
  asyncHandler(async (req: AuthedRequest, res) => {
    const p = await ownerPlaybook(req, req.params.id);
    const config = (p.trigger_config ?? {}) as { itemType?: string; itemId?: number; actionType?: string; recipientContactId?: number | null };

    let recipientUserId: number | null = null;
    if (config.recipientContactId) {
      const contact = await row<{ email: string }>('SELECT email FROM emergency_contacts WHERE id = $1 AND user_id = $2', [config.recipientContactId, req.userId]);
      if (contact) {
        const recipientUser = await row<{ id: number }>('SELECT id FROM users WHERE lower(email) = lower($1)', [contact.email]);
        recipientUserId = recipientUser ? Number(recipientUser.id) : null;
      }
    }

    const execution = await row<ExecutionRow>(
      `INSERT INTO estate_executions
         (playbook_id, user_id, recipient_user_id, item_type, item_id, item_title, action_type, source_type, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'OWNER_RELEASE', 'RELEASED')
       RETURNING *`,
      [p.id, req.userId, recipientUserId, config.itemType ?? 'NOTE', config.itemId ?? Number(p.id), p.title, config.actionType ?? 'RELEASE']
    );

    res.status(201).json(await toExecution(execution!, false));
  })
);

async function loadExecution(req: AuthedRequest, id: string): Promise<ExecutionRow> {
  const e = await row<ExecutionRow>('SELECT * FROM estate_executions WHERE id = $1', [id]);
  if (!e || (Number(e.user_id) !== Number(req.userId) && Number(e.recipient_user_id) !== Number(req.userId))) {
    throw notFound('No execution found.');
  }
  return e;
}

async function releasedItemPayload(req: AuthedRequest, e: ExecutionRow) {
  const owner = await row<{ full_name: string; email: string }>('SELECT full_name, email FROM users WHERE id = $1', [e.user_id]);
  const viewUpdate = await row<ExecutionRow>(
    `UPDATE estate_executions SET viewed_at = COALESCE(viewed_at, now()) WHERE id = $1 RETURNING *`,
    [e.id]
  );

  const base = {
    executionId: Number(e.id),
    ownerName: owner?.full_name ?? '',
    ownerEmail: owner?.email ?? '',
    actionType: e.action_type,
    instructions: '',
    itemType: e.item_type,
    itemId: Number(e.item_id),
    title: e.item_title,
    releasedAt: e.released_at.toISOString(),
    viewedAt: viewUpdate?.viewed_at ? viewUpdate.viewed_at.toISOString() : null,
  };

  if (e.item_type === 'PASSWORD') {
    const item = await row<{ title: string; website: string | null; username_value: string | null; password_enc: string; notes_enc: string | null; created_at: Date; updated_at: Date }>(
      `SELECT * FROM vault_passwords WHERE id = $1`, [e.item_id]
    );
    return { ...base, title: item?.title ?? e.item_title, usernameValue: item?.username_value ?? null, password: item ? decryptAtRestSafe(item.password_enc) : null, website: item?.website ?? null, notes: item ? decryptAtRestSafe(item.notes_enc) : null, itemCreatedAt: item?.created_at.toISOString() ?? null, itemUpdatedAt: item?.updated_at.toISOString() ?? null };
  }
  if (e.item_type === 'NOTE') {
    const item = await row<{ title: string; category: string | null; content_enc: string; pinned: boolean; created_at: Date; updated_at: Date }>(`SELECT * FROM notes WHERE id = $1`, [e.item_id]);
    return { ...base, title: item?.title ?? e.item_title, category: item?.category ?? null, content: item ? decryptAtRestSafe(item.content_enc) : null, pinned: item?.pinned ?? null, itemCreatedAt: item?.created_at.toISOString() ?? null, itemUpdatedAt: item?.updated_at.toISOString() ?? null };
  }
  if (e.item_type === 'CARD') {
    const item = await row<{ card_name: string; card_number_enc: string; cardholder_enc: string | null; notes_enc: string | null; created_at: Date; updated_at: Date }>(`SELECT * FROM cards WHERE id = $1`, [e.item_id]);
    return { ...base, title: item?.card_name ?? e.item_title, cardName: item?.card_name ?? null, cardNumber: item ? decryptAtRestSafe(item.card_number_enc) : null, cardholderName: item ? decryptAtRestSafe(item.cardholder_enc) : null, documentNotes: item ? decryptAtRestSafe(item.notes_enc) : null, itemCreatedAt: item?.created_at.toISOString() ?? null, itemUpdatedAt: item?.updated_at.toISOString() ?? null };
  }
  if (e.item_type === 'DOCUMENT') {
    const item = await row<{ title: string; file_name: string; mime_type: string | null; size_bytes: number; created_at: Date; updated_at: Date }>(`SELECT * FROM documents WHERE id = $1`, [e.item_id]);
    return { ...base, title: item?.title ?? e.item_title, documentName: item?.file_name ?? null, documentType: item?.mime_type ?? null, sizeBytes: item ? Number(item.size_bytes) : null, itemCreatedAt: item?.created_at.toISOString() ?? null, itemUpdatedAt: item?.updated_at.toISOString() ?? null };
  }
  return base;
}

router.get('/executions/:id/item', requireAuth, asyncHandler(async (req: AuthedRequest, res) => {
  const e = await loadExecution(req, req.params.id);
  if (Number(e.recipient_user_id) !== Number(req.userId)) throw forbidden('Only the recipient can open this released item.');
  res.json(await releasedItemPayload(req, e));
}));

router.get('/executions/:id/document', requireAuth, asyncHandler(async (req: AuthedRequest, res) => {
  const e = await loadExecution(req, req.params.id);
  if (Number(e.recipient_user_id) !== Number(req.userId)) throw forbidden('Only the recipient can download this document.');
  const item = await row<{ storage_key: string; file_name: string; mime_type: string | null }>(
    `SELECT storage_key, file_name, mime_type FROM documents WHERE id = $1`,
    [e.item_id]
  );
  if (!item) throw notFound();
  const data = await readEncryptedFile(Number(e.user_id), item.storage_key);
  res.setHeader('Content-Type', item.mime_type ?? 'application/octet-stream');
  res.send(data);
}));

router.post('/executions/:id/cancel', requireAuth, asyncHandler(async (req: AuthedRequest, res) => {
  const e = await loadExecution(req, req.params.id);
  if (Number(e.user_id) !== Number(req.userId)) throw forbidden('Only the owner can cancel this execution.');
  const updated = await row<ExecutionRow>(`UPDATE estate_executions SET status = 'CANCELLED', cancelled_at = now() WHERE id = $1 RETURNING *`, [e.id]);
  res.json(await toExecution(updated!, false));
}));

router.post('/executions/:id/complete', requireAuth, asyncHandler(async (req: AuthedRequest, res) => {
  const e = await loadExecution(req, req.params.id);
  if (Number(e.recipient_user_id) !== Number(req.userId)) throw forbidden('Only the recipient can complete this execution.');
  const updated = await row<ExecutionRow>(`UPDATE estate_executions SET status = 'COMPLETED', completed_at = now() WHERE id = $1 RETURNING *`, [e.id]);
  res.json(await toExecution(updated!, true));
}));

export default router;