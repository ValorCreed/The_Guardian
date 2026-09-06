import { Router } from 'express';
import { z } from 'zod';

import { asyncHandler, notFound, forbidden, ApiError } from '../lib/errors';
import { query, row, rows } from '../db/pool';
import { requireAuth, type AuthedRequest } from '../middleware/auth';
import { getPlanForUser } from '../lib/plan';
import { decryptAtRestSafe } from '../lib/crypto';
import { readEncryptedFile } from '../lib/storage';

const router = Router({ mergeParams: true });

type MembershipRow = {
  id: number;
  owner_user_id: number;
  member_user_id: number;
  member_email: string;
  role: string;
  status: string;
  access_items: unknown;
  shared_by_owner: boolean;
  created_at: Date;
};

type AccessItem = { type: string; itemId: number };

function parseAccess(value: unknown): AccessItem[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((v) => {
      const t = v as { type?: string; itemId?: number; item_id?: number };
      return { type: String(t.type || '').toUpperCase(), itemId: Number(t.itemId ?? t.item_id ?? 0) };
    })
    .filter((v) => v.type && v.itemId > 0);
}

function accessToIds(access: AccessItem[], type: string): number[] {
  return access.filter((a) => a.type === type).map((a) => a.itemId);
}

async function assertFamilyOwner(req: AuthedRequest): Promise<void> {
  const plan = await getPlanForUser(Number(req.userId));
  if (plan !== 'FAMILY') {
    throw new ApiError(
      403,
      'Only Family plan users can add members. Upgrade to Family to share your vault.',
      'PLAN_LIMIT_REACHED'
    );
  }
}

async function membershipForOwner(req: AuthedRequest, membershipId: string): Promise<MembershipRow> {
  const m = await row<MembershipRow>(
    `SELECT * FROM family_memberships WHERE id = $1 AND owner_user_id = $2`,
    [membershipId, req.userId]
  );
  if (!m) throw notFound('No family membership found.');
  return m;
}

function toFamilyMember(m: MembershipRow, fullName: string) {
  const access = parseAccess(m.access_items);
  return {
    membershipId: Number(m.id),
    userId: Number(m.member_user_id),
    fullName,
    email: m.member_email,
    joinedAt: m.created_at.toISOString(),
    sharePasswords: access.some((a) => a.type === 'PASSWORD'),
    shareCards: access.some((a) => a.type === 'CARD'),
    shareDocuments: access.some((a) => a.type === 'DOCUMENT'),
    shareNotes: access.some((a) => a.type === 'NOTE'),
  };
}

function buildAccess(body: {
  sharePasswords?: boolean;
  shareCards?: boolean;
  shareDocuments?: boolean;
  shareNotes?: boolean;
  passwordItemIds?: number[];
  cardItemIds?: number[];
  documentItemIds?: number[];
  noteItemIds?: number[];
}): AccessItem[] {
  const access: AccessItem[] = [];
  if (body.sharePasswords) access.push(...(body.passwordItemIds ?? []).map((itemId) => ({ type: 'PASSWORD', itemId })));
  if (body.shareCards) access.push(...(body.cardItemIds ?? []).map((itemId) => ({ type: 'CARD', itemId })));
  if (body.shareDocuments) access.push(...(body.documentItemIds ?? []).map((itemId) => ({ type: 'DOCUMENT', itemId })));
  if (body.shareNotes) access.push(...(body.noteItemIds ?? []).map((itemId) => ({ type: 'NOTE', itemId })));
  return access;
}

/* ----- Overview & membership management ----- */

router.get(
  '/',
  requireAuth,
  asyncHandler(async (req: AuthedRequest, res) => {
    if (req.sessionMode === 'DURESS') {
      return res.json({ familyPlan: false, admin: false, groupId: null, memberLimit: 0, memberCount: 0, members: [], sharedVaultOwners: [] });
    }
    const myPlan = await getPlanForUser(Number(req.userId));
    const familyPlan = myPlan === 'FAMILY';

    const myMemberships = await rows<MembershipRow>(
      `SELECT * FROM family_memberships WHERE owner_user_id = $1 ORDER BY created_at`,
      [req.userId]
    );
    const incomingMemberships = await rows<MembershipRow>(
      `SELECT * FROM family_memberships WHERE member_user_id = $1 ORDER BY created_at`,
      [req.userId]
    );

    const members: { membershipId: number; userId: number; fullName: string; email: string; joinedAt: string; sharePasswords: boolean; shareCards: boolean; shareDocuments: boolean; shareNotes: boolean }[] = [];
    for (const m of myMemberships) {
      const u = await row<{ full_name: string }>('SELECT full_name FROM users WHERE id = $1', [m.member_user_id]);
      members.push(toFamilyMember(m, u?.full_name ?? m.member_email));
    }

    const sharedVaultOwners: { ownerId: number; fullName: string; email: string }[] = [];
    for (const m of incomingMemberships) {
      const owner = await row<{ full_name: string; email: string }>('SELECT full_name, email FROM users WHERE id = $1', [m.owner_user_id]);
      if (owner) sharedVaultOwners.push({ ownerId: Number(m.owner_user_id), fullName: owner.full_name, email: owner.email });
    }

    res.json({
      familyPlan,
      admin: familyPlan,
      groupId: familyPlan ? Number(req.userId) : null,
      memberLimit: 10,
      memberCount: myMemberships.length,
      members,
      sharedVaultOwners,
    });
  })
);

router.get(
  '/members/lookup',
  requireAuth,
  asyncHandler(async (req: AuthedRequest, res) => {
    const email = String(req.query.email || '').trim().toLowerCase();
    if (!email) throw notFound('Enter an email address.');

    const user = await row<{ id: number; full_name: string; email: string }>(
      'SELECT id, full_name, email FROM users WHERE email = $1',
      [email]
    );
    if (!user) {
      res.json({ code: 'NOT_FOUND', exists: false, email });
      return;
    }

    res.json({ code: 'FOUND', exists: true, userId: Number(user.id), fullName: user.full_name, email: user.email });
  })
);

router.post(
  '/members',
  requireAuth,
  asyncHandler(async (req: AuthedRequest, res) => {
    if (req.sessionMode === 'DURESS') throw forbidden('Not available in this session.');
    await assertFamilyOwner(req);

    const body = z
      .object({
        email: z.string().trim().toLowerCase().email().max(254),
        sharePasswords: z.boolean().optional().default(false),
        shareCards: z.boolean().optional().default(false),
        shareDocuments: z.boolean().optional().default(false),
        shareNotes: z.boolean().optional().default(false),
        passwordItemIds: z.array(z.number().int().positive()).optional().default([]),
        cardItemIds: z.array(z.number().int().positive()).optional().default([]),
        documentItemIds: z.array(z.number().int().positive()).optional().default([]),
        noteItemIds: z.array(z.number().int().positive()).optional().default([]),
      })
      .parse(req.body);

    const member = await row<{ id: number; full_name: string; email: string }>(
      'SELECT id, full_name, email FROM users WHERE email = $1',
      [body.email]
    );
    if (!member) throw notFound('No Guardian account was found for that email.');

    const counts = await rows<{ owner_user_id: number; member_user_id: number }>(
      `SELECT owner_user_id, member_user_id FROM family_memberships WHERE member_user_id = $1`,
      [member.id]
    );
    if (counts.some((c) => Number(c.owner_user_id) !== Number(req.userId))) {
      throw new ApiError(409, 'This user already belongs to another family group.', 'FAMILY_ALREADY_GROUP');
    }

    const access = buildAccess(body);
    const m = await row<MembershipRow>(
      `INSERT INTO family_memberships (owner_user_id, member_user_id, member_email, role, status, access_items, shared_by_owner)
       VALUES ($1, $2, $3, 'MEMBER', 'ACTIVE', $4, true)
       ON CONFLICT (owner_user_id, member_email)
       DO UPDATE SET status = 'ACTIVE', access_items = EXCLUDED.access_items, shared_by_owner = true
       RETURNING *`,
      [req.userId, member.id, member.email, JSON.stringify(access)]
    );

    res.status(201).json(toFamilyMember(m!, member.full_name));
  })
);

router.get(
  '/members/:id/access',
  requireAuth,
  asyncHandler(async (req: AuthedRequest, res) => {
    const m = await membershipForOwner(req, req.params.id);
    const member = await row<{ full_name: string }>('SELECT full_name FROM users WHERE id = $1', [m.member_user_id]);
    const access = parseAccess(m.access_items);
    res.json({
      membershipId: Number(m.id),
      userId: Number(m.member_user_id),
      fullName: member?.full_name ?? m.member_email,
      email: m.member_email,
      passwordItemIds: accessToIds(access, 'PASSWORD'),
      cardItemIds: accessToIds(access, 'CARD'),
      documentItemIds: accessToIds(access, 'DOCUMENT'),
      noteItemIds: accessToIds(access, 'NOTE'),
    });
  })
);

router.put(
  '/members/:id/access',
  requireAuth,
  asyncHandler(async (req: AuthedRequest, res) => {
    const m = await membershipForOwner(req, req.params.id);

    const body = z
      .object({
        sharePasswords: z.boolean().optional().default(false),
        shareCards: z.boolean().optional().default(false),
        shareDocuments: z.boolean().optional().default(false),
        shareNotes: z.boolean().optional().default(false),
        passwordItemIds: z.array(z.number().int().positive()).optional().default([]),
        cardItemIds: z.array(z.number().int().positive()).optional().default([]),
        documentItemIds: z.array(z.number().int().positive()).optional().default([]),
        noteItemIds: z.array(z.number().int().positive()).optional().default([]),
      })
      .parse(req.body);

    const access = buildAccess(body);
    await query(
      `UPDATE family_memberships SET access_items = $2, status = 'ACTIVE' WHERE id = $1`,
      [m.id, JSON.stringify(access)]
    );

    const updated = await row<MembershipRow>('SELECT * FROM family_memberships WHERE id = $1', [m.id]);
    const member = await row<{ full_name: string }>('SELECT full_name FROM users WHERE id = $1', [m.member_user_id]);
    res.json({
      ...(updated
        ? (() => {
            const acc = parseAccess(updated.access_items);
            return {
              membershipId: Number(updated.id),
              userId: Number(updated.member_user_id),
              fullName: member?.full_name ?? updated.member_email,
              email: updated.member_email,
              passwordItemIds: accessToIds(acc, 'PASSWORD'),
              cardItemIds: accessToIds(acc, 'CARD'),
              documentItemIds: accessToIds(acc, 'DOCUMENT'),
              noteItemIds: accessToIds(acc, 'NOTE'),
            };
          })()
        : null),
    });
  })
);

router.delete(
  '/members/:id',
  requireAuth,
  asyncHandler(async (req: AuthedRequest, res) => {
    const m = await membershipForOwner(req, req.params.id);
    await query('DELETE FROM family_memberships WHERE id = $1', [m.id]);
    res.status(204).send();
  })
);

/* ----- Shared items (member's view) ----- */

async function membershipsForMe(req: AuthedRequest): Promise<MembershipRow[]> {
  return rows<MembershipRow>(
    `SELECT * FROM family_memberships WHERE member_user_id = $1 AND status = 'ACTIVE' ORDER BY created_at`,
    [req.userId]
  );
}

async function findSharedItem(
  req: AuthedRequest,
  type: string,
  itemId: number
): Promise<{ itemId: number; type: string; membership: MembershipRow } | null> {
  const memberships = await membershipsForMe(req);
  for (const m of memberships) {
    const access = parseAccess(m.access_items);
    if (access.some((a) => a.type === type && a.itemId === itemId)) {
      return { itemId, type, membership: m };
    }
  }
  return null;
}

async function ownerInfo(ownerUserId: number): Promise<{ ownerId: number; ownerName: string; ownerEmail: string }> {
  const owner = await row<{ full_name: string; email: string }>('SELECT full_name, email FROM users WHERE id = $1', [ownerUserId]);
  return {
    ownerId: ownerUserId,
    ownerName: owner?.full_name ?? '',
    ownerEmail: owner?.email ?? '',
  };
}

async function collectShared(
  req: AuthedRequest,
  type: 'PASSWORD' | 'CARD' | 'NOTE' | 'DOCUMENT',
  withSecrets: boolean
): Promise<unknown[]> {
  const memberships = await membershipsForMe(req);
  const out: unknown[] = [];

  for (const m of memberships) {
    const access = parseAccess(m.access_items);
    const ids = accessToIds(access, type);
    if (ids.length === 0) continue;

    const owner = await ownerInfo(Number(m.owner_user_id));

    if (type === 'PASSWORD') {
      const items = await rows<{ id: number; title: string; website: string | null; username_value: string | null; password_enc: string; created_at: Date; updated_at: Date }>(
        `SELECT id, title, website, username AS username_value, password_enc, created_at, updated_at
           FROM vault_passwords WHERE user_id = $1 AND id = ANY($2::bigint[])`,
        [m.owner_user_id, ids]
      );
      for (const it of items) {
        const password = withSecrets ? (decryptAtRestSafe(it.password_enc) ?? '') : '';
        out.push({ ...owner, id: Number(it.id), itemType: 'PASSWORD', title: it.title, website: it.website ?? undefined, usernameValue: it.username_value ?? undefined, password, encryptedPassword: password, createdAt: it.created_at.toISOString(), updatedAt: it.updated_at.toISOString() });
      }
    } else if (type === 'CARD') {
      const items = await rows<{ id: number; card_name: string; card_number_enc: string; cardholder_enc: string | null; notes_enc: string | null; created_at: Date; updated_at: Date }>(
        `SELECT id, card_name, card_number_enc, cardholder_enc, notes_enc, created_at, updated_at
           FROM cards WHERE user_id = $1 AND id = ANY($2::bigint[])`,
        [m.owner_user_id, ids]
      );
      for (const it of items) {
        const holder = decryptAtRestSafe(it.cardholder_enc);
        out.push({ ...owner, id: Number(it.id), itemType: 'CARD', cardName: it.card_name, encryptedCardNumber: decryptAtRestSafe(it.card_number_enc) ?? '', encryptedExpiryDate: '', encryptedCvv: '', encryptedCardholderName: holder, encryptedCardHolderName: holder, encryptedNotes: decryptAtRestSafe(it.notes_enc) ?? null, createdAt: it.created_at.toISOString(), updatedAt: it.updated_at.toISOString() });
      }
    } else if (type === 'NOTE') {
      const items = await rows<{ id: number; title: string; category: string | null; content_enc: string; pinned: boolean; created_at: Date; updated_at: Date }>(
        `SELECT id, title, category, content_enc, pinned, created_at, updated_at
           FROM notes WHERE user_id = $1 AND id = ANY($2::bigint[])`,
        [m.owner_user_id, ids]
      );
      for (const it of items) {
        out.push({ ...owner, id: Number(it.id), itemType: 'NOTE', title: it.title, category: it.category ?? null, encryptedContent: decryptAtRestSafe(it.content_enc) ?? '', pinned: it.pinned, createdAt: it.created_at.toISOString(), updatedAt: it.updated_at.toISOString() });
      }
    } else if (type === 'DOCUMENT') {
      const items = await rows<{ id: number; title: string; file_name: string; mime_type: string | null; size_bytes: number; created_at: Date; updated_at: Date }>(
        `SELECT id, title, file_name, mime_type, size_bytes, created_at, updated_at
           FROM documents WHERE user_id = $1 AND id = ANY($2::bigint[])`,
        [m.owner_user_id, ids]
      );
      for (const it of items) {
        out.push({ ...owner, id: Number(it.id), itemType: 'DOCUMENT', documentName: it.title, title: it.title, documentType: it.mime_type ?? 'application/octet-stream', mimeType: it.mime_type ?? 'application/octet-stream', sizeBytes: Number(it.size_bytes), createdAt: it.created_at.toISOString() });
      }
    }
  }

  return out;
}

router.get('/shared-items', requireAuth, asyncHandler(async (req: AuthedRequest, res) => {
  if (req.sessionMode === 'DURESS') return res.json({ passwords: [], cards: [], documents: [], notes: [] });
  const [passwords, cards, documents, notes] = await Promise.all([
    collectShared(req, 'PASSWORD', false),
    collectShared(req, 'CARD', true),
    collectShared(req, 'DOCUMENT', false),
    collectShared(req, 'NOTE', true),
  ]);
  res.json({ passwords, cards, documents, notes });
}));

router.get('/shared-passwords', requireAuth, asyncHandler(async (req: AuthedRequest, res) => {
  res.json(await collectShared(req, 'PASSWORD', false));
}));
router.get('/shared-passwords/:id', requireAuth, asyncHandler(async (req: AuthedRequest, res) => {
  const found = await findSharedItem(req, 'PASSWORD', Number(req.params.id));
  if (!found) throw notFound();
const p = await row<{ id: number; title: string; website: string | null; username_value: string | null; password_enc: string; created_at: Date; updated_at: Date }>(
  `SELECT id, title, website, username AS username_value, password_enc, created_at, updated_at FROM vault_passwords WHERE id = $1`,
  [Number(req.params.id)]
);
  if (!p) throw notFound();
  const owner = await ownerInfo(p ? Number(found.membership.owner_user_id) : 0);
  const password = decryptAtRestSafe(p.password_enc) ?? '';
  res.json({ ...owner, id: Number(p.id), itemType: 'PASSWORD', title: p.title, website: p.website ?? undefined, usernameValue: p.username_value ?? undefined, password, encryptedPassword: password, createdAt: p.created_at.toISOString(), updatedAt: p.updated_at.toISOString() });
}));

router.get('/shared-cards', requireAuth, asyncHandler(async (req: AuthedRequest, res) => {
  res.json(await collectShared(req, 'CARD', true));
}));
router.get('/shared-cards/:id', requireAuth, asyncHandler(async (req: AuthedRequest, res) => {
  const found = await findSharedItem(req, 'CARD', Number(req.params.id));
  if (!found) throw notFound();
  const it = await row<{ id: number; card_name: string; card_number_enc: string; cardholder_enc: string | null; notes_enc: string | null; created_at: Date; updated_at: Date }>(
    `SELECT id, card_name, card_number_enc, cardholder_enc, notes_enc, created_at, updated_at FROM cards WHERE id = $1`,
    [Number(req.params.id)]
  );
  if (!it) throw notFound();
  const owner = await ownerInfo(Number(found.membership.owner_user_id));
  const holder = decryptAtRestSafe(it.cardholder_enc);
  res.json({ ...owner, id: Number(it.id), itemType: 'CARD', cardName: it.card_name, encryptedCardNumber: decryptAtRestSafe(it.card_number_enc) ?? '', encryptedExpiryDate: '', encryptedCvv: '', encryptedCardholderName: holder, encryptedCardHolderName: holder, encryptedNotes: decryptAtRestSafe(it.notes_enc) ?? null, createdAt: it.created_at.toISOString(), updatedAt: it.updated_at.toISOString() });
}));

router.get('/shared-notes', requireAuth, asyncHandler(async (req: AuthedRequest, res) => {
  res.json(await collectShared(req, 'NOTE', true));
}));
router.get('/shared-notes/:id', requireAuth, asyncHandler(async (req: AuthedRequest, res) => {
  const found = await findSharedItem(req, 'NOTE', Number(req.params.id));
  if (!found) throw notFound();
  const it = await row<{ id: number; title: string; category: string | null; content_enc: string; pinned: boolean; created_at: Date; updated_at: Date }>(
    `SELECT id, title, category, content_enc, pinned, created_at, updated_at FROM notes WHERE id = $1`,
    [Number(req.params.id)]
  );
  if (!it) throw notFound();
  const owner = await ownerInfo(Number(found.membership.owner_user_id));
  res.json({ ...owner, id: Number(it.id), itemType: 'NOTE', title: it.title, category: it.category ?? null, encryptedContent: decryptAtRestSafe(it.content_enc) ?? '', pinned: it.pinned, createdAt: it.created_at.toISOString(), updatedAt: it.updated_at.toISOString() });
}));

router.get('/shared-documents', requireAuth, asyncHandler(async (req: AuthedRequest, res) => {
  res.json(await collectShared(req, 'DOCUMENT', false));
}));
router.get('/shared-documents/:id', requireAuth, asyncHandler(async (req: AuthedRequest, res) => {
  const found = await findSharedItem(req, 'DOCUMENT', Number(req.params.id));
  if (!found) throw notFound();
  const it = await row<{ id: number; title: string; file_name: string; mime_type: string | null; size_bytes: number; storage_key: string; created_at: Date; updated_at: Date }>(
    `SELECT id, title, file_name, mime_type, size_bytes, storage_key, created_at, updated_at FROM documents WHERE id = $1`,
    [Number(req.params.id)]
  );
  if (!it) throw notFound();
  const owner = await ownerInfo(Number(found.membership.owner_user_id));
  res.json({ ...owner, id: Number(it.id), itemType: 'DOCUMENT', documentName: it.title, title: it.title, documentType: it.mime_type ?? 'application/octet-stream', mimeType: it.mime_type ?? 'application/octet-stream', sizeBytes: Number(it.size_bytes), createdAt: it.created_at.toISOString() });
}));

router.get('/shared-documents/:id/download', requireAuth, asyncHandler(async (req: AuthedRequest, res) => {
  const found = await findSharedItem(req, 'DOCUMENT', Number(req.params.id));
  if (!found) throw notFound();
  const it = await row<{ storage_key: string; file_name: string; mime_type: string | null; title: string }>(
    `SELECT storage_key, file_name, mime_type, title FROM documents WHERE id = $1`,
    [Number(req.params.id)]
  );
  if (!it) throw notFound();
  const data = await readEncryptedFile(Number(found.membership.owner_user_id), it.storage_key);
  res.setHeader('Content-Type', it.mime_type ?? 'application/octet-stream');
  res.setHeader('Content-Length', String(data.length));
  res.send(data);
}));

router.get('/member-password-risks', requireAuth, asyncHandler(async (req: AuthedRequest, res) => {
  const risks = await rows<{ id: number; title: string; website: string | null; username_value: string | null; member_user_id: number; member_email: string }>(
    `SELECT DISTINCT vp.id, vp.title, vp.website, vp.username AS username_value, fm.member_user_id, fm.member_email
       FROM family_memberships fm
       JOIN LATERAL jsonb_array_elements(fm.access_items) AS acc ON true
       JOIN vault_passwords vp ON vp.user_id = fm.owner_user_id AND vp.id = (acc.value->>'itemId')::bigint
       JOIN users mu ON mu.id = fm.member_user_id
      WHERE fm.member_user_id = $1 AND acc.value->>'type' = 'PASSWORD'`,
    [req.userId]
  );
  const memberInfos = new Map<number, { name: string; email: string }>();
  for (const r of risks) {
    if (!memberInfos.has(Number(r.member_user_id))) {
      memberInfos.set(Number(r.member_user_id), { name: r.member_email.split('@')[0], email: r.member_email });
    }
  }
  res.json(
    risks.map((r) => {
      const member = memberInfos.get(Number(r.member_user_id)) ?? { name: '', email: r.member_email };
      const strengthScore = 62;
      return {
        id: Number(r.id),
        itemType: 'FAMILY_MEMBER_PASSWORD_RISK',
        title: r.title,
        usernameValue: r.username_value ?? null,
        website: r.website ?? null,
        memberId: Number(r.member_user_id),
        memberName: member.name,
        memberEmail: member.email,
        strengthScore,
        strengthLabel: strengthScore >= 75 ? 'STRONG' : strengthScore >= 50 ? 'MEDIUM' : 'WEAK',
        oldPassword: false,
        reusedPassword: false,
        reusedCount: 0,
        riskTypes: ['SHARED'],
      };
    })
  );
}));

export default router;