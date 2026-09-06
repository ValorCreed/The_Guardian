import { Router } from 'express';
import { z } from 'zod';

import { asyncHandler, notFound, forbidden, badRequest, ApiError } from '../lib/errors';
import { query, row, rows } from '../db/pool';
import { requireAuth, type AuthedRequest } from '../middleware/auth';
import { getPlanForUser, PLAN_LIMITS } from '../lib/plan';
import { decryptAtRestSafe } from '../lib/crypto';
import { readEncryptedFile } from '../lib/storage';
import { notifyOwnerAboutEmergencyRequest, notifyRequesterDecision } from '../services/notifications';

const router = Router({ mergeParams: true });

type ContactRow = {
  id: number;
  name: string;
  email: string | null;
  relationship: string | null;
  waiting_period_hours: number;
  allow_passwords: boolean;
  allow_cards: boolean;
  allow_documents: boolean;
  allow_notes: boolean;
  encrypted_emergency_note: string | null;
  active: boolean;
  created_at: Date;
  updated_at: Date;
};

function toContact(c: ContactRow) {
  return {
    id: Number(c.id),
    contactEmail: c.email ?? '',
    contactName: c.name,
    relationship: c.relationship ?? null,
    waitingPeriodHours: c.waiting_period_hours,
    allowPasswords: c.allow_passwords,
    allowCards: c.allow_cards,
    allowDocuments: c.allow_documents,
    allowNotes: c.allow_notes,
    encryptedEmergencyNote: c.encrypted_emergency_note ?? null,
    active: c.active,
    createdAt: c.created_at.toISOString(),
    updatedAt: c.updated_at.toISOString(),
  };
}

type RequestRow = {
  id: number;
  owner_email: string;
  owner_user_id: number;
  requester_email: string;
  requester_user_id: number;
  message: string | null;
  status: string;
  requested_at: Date;
  decided_at: Date | null;
};

async function contactForRequest(r: RequestRow): Promise<ContactRow | null> {
  const contact = await row<ContactRow>(
    `SELECT id, name, email, relationship, waiting_period_hours, allow_passwords, allow_cards, allow_documents, allow_notes, encrypted_emergency_note, active, created_at, updated_at
       FROM emergency_contacts WHERE user_id = $1 AND email = $2 ORDER BY active DESC, id DESC LIMIT 1`,
    [r.owner_user_id, r.requester_email]
  );
  return contact;
}

async function toRequest(r: RequestRow) {
  const [owner, requester] = await Promise.all([
    row<{ full_name: string; email: string }>('SELECT full_name, email FROM users WHERE id = $1', [r.owner_user_id]),
    row<{ full_name: string; email: string }>('SELECT full_name, email FROM users WHERE id = $1', [r.requester_user_id]),
  ]);
  const contact = await contactForRequest(r);
  const decided = r.decided_at;
  return {
    id: Number(r.id),
    contactId: contact ? Number(contact.id) : null,
    ownerEmail: r.owner_email,
    ownerName: owner?.full_name ?? null,
    requesterEmail: r.requester_email,
    requesterName: requester?.full_name ?? null,
    status: r.status,
    message: r.message ?? null,
    requestedAt: r.requested_at.toISOString(),
    availableAt: r.status === 'APPROVED' && decided ? decided.toISOString() : null,
    approvedAt: r.status === 'APPROVED' && decided ? decided.toISOString() : null,
    deniedAt: r.status === 'DENIED' && decided ? decided.toISOString() : null,
    passwordsAllowed: contact?.allow_passwords ?? false,
    cardsAllowed: contact?.allow_cards ?? false,
    documentsAllowed: contact?.allow_documents ?? false,
    notesAllowed: contact?.allow_notes ?? true,
    encryptedEmergencyNote: contact?.encrypted_emergency_note ?? null,
  };
}

async function assertEmergencyEligible(req: AuthedRequest): Promise<void> {
  const plan = await getPlanForUser(Number(req.userId));
  if (plan === 'FREE') {
    throw new ApiError(403, 'Emergency Access is available on Premium and Family plans.', 'PLAN_LIMIT_REACHED');
  }
}

/* ----- Contacts ----- */

const contactBodySchema = z.object({
  contactEmail: z.string().trim().toLowerCase().email().max(254),
  contactName: z.string().trim().min(1).max(200),
  relationship: z.string().trim().max(80).nullable().optional(),
  waitingPeriodHours: z.number().int().min(0).max(72 * 24 * 60).optional(),
  allowPasswords: z.boolean().optional().default(false),
  allowCards: z.boolean().optional().default(false),
  allowDocuments: z.boolean().optional().default(false),
  allowNotes: z.boolean().optional().default(true),
  encryptedEmergencyNote: z.string().max(200_000).nullable().optional(),
  active: z.boolean().optional().default(true),
});

function contactFromBody(body: z.infer<typeof contactBodySchema>) {
  return {
    name: body.contactName.trim(),
    email: body.contactEmail.trim().toLowerCase(),
    relationship: body.relationship?.trim() ?? 'Trusted contact',
    waiting_period_hours: body.waitingPeriodHours ?? 72,
    allow_passwords: Boolean(body.allowPasswords),
    allow_cards: Boolean(body.allowCards),
    allow_documents: Boolean(body.allowDocuments),
    allow_notes: body.allowNotes !== false,
    encrypted_emergency_note: body.encryptedEmergencyNote || null,
    active: body.active !== false,
  };
}

const CONTACT_COLUMNS = `id, name, email, relationship, waiting_period_hours, allow_passwords, allow_cards, allow_documents, allow_notes, encrypted_emergency_note, active, created_at, updated_at`;

router.get(
  '/contacts',
  requireAuth,
  asyncHandler(async (req: AuthedRequest, res) => {
    if (req.sessionMode === 'DURESS') return res.json([]);
    await assertEmergencyEligible(req);
    const items = await rows<ContactRow>(`SELECT ${CONTACT_COLUMNS} FROM emergency_contacts WHERE user_id = $1 ORDER BY name`, [req.userId]);
    res.json(items.map(toContact));
  })
);

router.post(
  '/contacts',
  requireAuth,
  asyncHandler(async (req: AuthedRequest, res) => {
    await assertEmergencyEligible(req);
    const body = contactBodySchema.parse(req.body);
    const plan = await getPlanForUser(Number(req.userId));
    const limit = PLAN_LIMITS[plan].emergencyContactLimit;
    if (limit !== null) {
      const count = await row<{ count: string }>('SELECT COUNT(*)::int AS count FROM emergency_contacts WHERE user_id = $1', [req.userId]);
      if (Number(count?.count ?? 0) >= limit) {
        throw new ApiError(403, `Your ${plan} plan supports up to ${limit} emergency contacts.`, 'PLAN_LIMIT_REACHED');
      }
    }

    const values = contactFromBody(body);
    const c = await row<ContactRow>(
      `INSERT INTO emergency_contacts (user_id, name, email, relationship, waiting_period_hours, allow_passwords, allow_cards, allow_documents, allow_notes, encrypted_emergency_note, active)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       RETURNING ${CONTACT_COLUMNS}`,
      [
        req.userId,
        values.name,
        values.email,
        values.relationship,
        values.waiting_period_hours,
        values.allow_passwords,
        values.allow_cards,
        values.allow_documents,
        values.allow_notes,
        values.encrypted_emergency_note,
        values.active,
      ]
    );
    res.status(201).json(toContact(c!));
  })
);

router.get(
  '/contacts/:id',
  requireAuth,
  asyncHandler(async (req: AuthedRequest, res) => {
    const c = await row<ContactRow>(
      `SELECT ${CONTACT_COLUMNS} FROM emergency_contacts WHERE id = $1 AND user_id = $2`,
      [req.params.id, req.userId]
    );
    if (!c) throw notFound();
    res.json(toContact(c));
  })
);

router.put(
  '/contacts/:id',
  requireAuth,
  asyncHandler(async (req: AuthedRequest, res) => {
    const existing = await row<{ id: number }>(`SELECT id FROM emergency_contacts WHERE id = $1 AND user_id = $2`, [req.params.id, req.userId]);
    if (!existing) throw notFound();

    const body = contactBodySchema.parse(req.body);
    const values = contactFromBody(body);
    const c = await row<ContactRow>(
      `UPDATE emergency_contacts SET
          name = $3,
          email = $4,
          relationship = $5,
          waiting_period_hours = $6,
          allow_passwords = $7,
          allow_cards = $8,
          allow_documents = $9,
          allow_notes = $10,
          encrypted_emergency_note = $11,
          active = $12,
          updated_at = now()
        WHERE id = $1 AND user_id = $2
        RETURNING ${CONTACT_COLUMNS}`,
      [
        req.params.id,
        req.userId,
        values.name,
        values.email,
        values.relationship,
        values.waiting_period_hours,
        values.allow_passwords,
        values.allow_cards,
        values.allow_documents,
        values.allow_notes,
        values.encrypted_emergency_note,
        values.active,
      ]
    );
    res.json(toContact(c!));
  })
);

router.delete(
  '/contacts/:id',
  requireAuth,
  asyncHandler(async (req: AuthedRequest, res) => {
    await query('DELETE FROM emergency_contacts WHERE id = $1 AND user_id = $2', [req.params.id, req.userId]);
    res.status(204).send();
  })
);

/* ----- Overview ----- */

router.get(
  '/overview',
  requireAuth,
  asyncHandler(async (req: AuthedRequest, res) => {
    if (req.sessionMode === 'DURESS') {
      return res.json({ plan: 'FREE', premiumOrFamily: false, contactLimit: 0, contactCount: 0, contacts: [], receivedRequests: [], sentRequests: [], auditLogs: [] });
    }
    const plan = await getPlanForUser(Number(req.userId));
    const contacts = await rows<ContactRow>(`SELECT ${CONTACT_COLUMNS} FROM emergency_contacts WHERE user_id = $1 ORDER BY name`, [req.userId]);
    const requests = await rows<RequestRow>(`SELECT * FROM emergency_requests WHERE owner_user_id = $1 OR requester_user_id = $1 ORDER BY requested_at DESC`, [req.userId]);
    const audit = await rows<{ id: number; requester_user_id: number; owner_user_id: number; action: string; detail: string | null; created_at: Date }>(
      `SELECT * FROM emergency_audit WHERE owner_user_id = $1 OR requester_user_id = $1 ORDER BY created_at DESC LIMIT 100`,
      [req.userId]
    );

    const received = [];
    const sent = [];
    for (const r of requests) {
      const item = await toRequest(r);
      if (Number(r.owner_user_id) === Number(req.userId)) received.push(item);
      else sent.push(item);
    }

    const actorCache = new Map<number, string>();
    const auditLogs = [];
    for (const a of audit) {
      const actorId = a.action === 'REQUESTED' ? a.requester_user_id : a.owner_user_id;
      if (!actorCache.has(Number(actorId))) {
        const u = await row<{ email: string }>('SELECT email FROM users WHERE id = $1', [actorId]);
        actorCache.set(Number(actorId), u?.email ?? '');
      }
      auditLogs.push({
        id: Number(a.id),
        action: a.action,
        title: String(a.action).replace(/_/g, ' ').toLowerCase().replace(/^./, (c) => c.toUpperCase()),
        message: a.detail ?? null,
        actorEmail: actorCache.get(Number(actorId)) ?? null,
        createdAt: a.created_at.toISOString(),
      });
    }

    res.json({
      plan,
      premiumOrFamily: plan !== 'FREE',
      contactLimit: PLAN_LIMITS[plan].emergencyContactLimit ?? 0,
      contactCount: contacts.length,
      contacts: contacts.map(toContact),
      receivedRequests: received,
      sentRequests: sent,
      auditLogs,
    });
  })
);

/* ----- Requests ----- */

router.get(
  '/requests',
  requireAuth,
  asyncHandler(async (req: AuthedRequest, res) => {
    if (req.sessionMode === 'DURESS') return res.json([]);
    const requests = await rows<RequestRow>(`SELECT * FROM emergency_requests WHERE owner_user_id = $1 OR requester_user_id = $1 ORDER BY requested_at DESC`, [req.userId]);
    const out = [];
    for (const r of requests) out.push(await toRequest(r));
    res.json(out);
  })
);

router.post(
  '/requests',
  requireAuth,
  asyncHandler(async (req: AuthedRequest, res) => {
    if (req.sessionMode === 'DURESS') throw forbidden('Emergency requests are not available right now.');
    await assertEmergencyEligible(req);

    const body = z
      .object({
        ownerEmail: z.string().trim().toLowerCase().email().max(254),
        message: z.string().trim().max(1000).nullable().optional(),
      })
      .parse(req.body);

    const owner = await row<{ id: number; email: string }>('SELECT id, email FROM users WHERE email = $1', [body.ownerEmail]);
    if (!owner) throw notFound('No Guardian account was found for that email.');
    if (Number(owner.id) === Number(req.userId)) throw forbidden('You cannot request emergency access from yourself.');

    const requester = await row<{ email: string; full_name: string }>('SELECT email, full_name FROM users WHERE id = $1', [req.userId]);
    if (!requester) throw notFound();

    const matchedContact = await row<ContactRow>(
      `SELECT ${CONTACT_COLUMNS} FROM emergency_contacts WHERE user_id = $1 AND email = $2 AND active = true ORDER BY id DESC LIMIT 1`,
      [owner.id, requester.email]
    );
    if (!matchedContact) {
      throw badRequest('That person has not added you as an emergency contact.');
    }

    const request = await row<RequestRow>(
      `INSERT INTO emergency_requests (owner_email, owner_user_id, requester_email, requester_user_id, message)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (owner_user_id, requester_user_id, status)
       DO UPDATE SET message = EXCLUDED.message, requested_at = now()
       RETURNING *`,
      [body.ownerEmail, owner.id, requester!.email, req.userId, body.message ?? null]
    );

    await query(
      `INSERT INTO emergency_audit (requester_user_id, owner_user_id, action, detail)
       VALUES ($1, $2, 'REQUESTED', $3)`,
      [req.userId, owner.id, body.message ?? null]
    );

    await notifyOwnerAboutEmergencyRequest(Number(owner.id), requester!.full_name, requester!.email);

    res.status(201).json(await toRequest(request!));
  })
);

async function loadRequestForOwner(req: AuthedRequest, requestId: string): Promise<RequestRow> {
  const r = await row<RequestRow>(`SELECT * FROM emergency_requests WHERE id = $1 AND owner_user_id = $2`, [requestId, req.userId]);
  if (!r) throw notFound('No pending request found.');
  return r;
}

router.post(
  '/requests/:id/approve',
  requireAuth,
  asyncHandler(async (req: AuthedRequest, res) => {
    if (req.sessionMode === 'DURESS') throw forbidden('Not available in this session.');
    const r = await loadRequestForOwner(req, req.params.id);
    if (r.status !== 'PENDING') throw forbidden('This request was already decided.');

    await query(`UPDATE emergency_requests SET status = 'APPROVED', decided_at = now() WHERE id = $1`, [r.id]);
    await query(
      `INSERT INTO emergency_audit (requester_user_id, owner_user_id, action, detail)
       VALUES ($1, $2, 'APPROVED', NULL)`,
      [r.requester_user_id, r.owner_user_id]
    );
    await notifyRequesterDecision(Number(r.requester_user_id), 'APPROVED');

    const updated = await row<RequestRow>('SELECT * FROM emergency_requests WHERE id = $1', [r.id]);
    res.json(await toRequest(updated!));
  })
);

router.post(
  '/requests/:id/deny',
  requireAuth,
  asyncHandler(async (req: AuthedRequest, res) => {
    if (req.sessionMode === 'DURESS') throw forbidden('Not available in this session.');
    const r = await loadRequestForOwner(req, req.params.id);
    if (r.status !== 'PENDING') throw forbidden('This request was already decided.');

    await query(`UPDATE emergency_requests SET status = 'DENIED', decided_at = now() WHERE id = $1`, [r.id]);
    await query(
      `INSERT INTO emergency_audit (requester_user_id, owner_user_id, action, detail)
       VALUES ($1, $2, 'DENIED', NULL)`,
      [r.requester_user_id, r.owner_user_id]
    );
    await notifyRequesterDecision(Number(r.requester_user_id), 'DENIED');

    const updated = await row<RequestRow>('SELECT * FROM emergency_requests WHERE id = $1', [r.id]);
    res.json(await toRequest(updated!));
  })
);

/* ----- Approved-access vault reads ----- */

type VaultCollection = 'PASSWORD' | 'CARD' | 'NOTE' | 'DOCUMENT';

async function loadApprovedRequestAsRequester(req: AuthedRequest, requestId: string): Promise<{ request: RequestRow; contact: ContactRow }> {
  const r = await row<RequestRow>(
    `SELECT * FROM emergency_requests WHERE id = $1 AND requester_user_id = $2 AND status = 'APPROVED'`,
    [requestId, req.userId]
  );
  if (!r) throw forbidden('This emergency access request is not approved.');
  const contact = await contactForRequest(r);
  if (!contact || !contact.active) throw forbidden('Emergency access was revoked by the owner.');
  return { request: r, contact };
}

function allowedTypes(contact: ContactRow): VaultCollection[] {
  const types: VaultCollection[] = [];
  if (contact.allow_passwords) types.push('PASSWORD');
  if (contact.allow_cards) types.push('CARD');
  if (contact.allow_documents) types.push('DOCUMENT');
  if (contact.allow_notes) types.push('NOTE');
  return types;
}

router.get(
  '/requests/:requestId/vault',
  requireAuth,
  asyncHandler(async (req: AuthedRequest, res) => {
    if (req.sessionMode === 'DURESS') return res.json({ passwords: [], cards: [], notes: [], documents: [] });
    const { request, contact } = await loadApprovedRequestAsRequester(req, req.params.requestId);
    const ownerId = Number(request.owner_user_id);
    const owner = await row<{ full_name: string; email: string }>('SELECT full_name, email FROM users WHERE id = $1', [ownerId]);
    const types = allowedTypes(contact);

    const [passwords, cards, notes, documents] = await Promise.all([
      types.includes('PASSWORD')
        ? rows<{ id: number; title: string; website: string | null; username: string | null; password_enc: string; created_at: Date; updated_at: Date }>(
            `SELECT id, title, website, username, password_enc, created_at, updated_at FROM vault_passwords WHERE user_id = $1`,
            [ownerId]
          )
        : Promise.resolve([]),
      types.includes('CARD')
        ? rows<{ id: number; card_name: string; card_number_enc: string; expiry_enc: string | null; cvv_enc: string | null; cardholder_enc: string | null; notes_enc: string | null; created_at: Date; updated_at: Date }>(
            `SELECT id, card_name, card_number_enc, expiry_enc, cvv_enc, cardholder_enc, notes_enc, created_at, updated_at FROM cards WHERE user_id = $1`,
            [ownerId]
          )
        : Promise.resolve([]),
      types.includes('NOTE')
        ? rows<{ id: number; title: string; category: string | null; content_enc: string; pinned: boolean; created_at: Date; updated_at: Date }>(
            `SELECT id, title, category, content_enc, pinned, created_at, updated_at FROM notes WHERE user_id = $1`,
            [ownerId]
          )
        : Promise.resolve([]),
      types.includes('DOCUMENT')
        ? rows<{ id: number; title: string; file_name: string; mime_type: string | null; size_bytes: number; created_at: Date; updated_at: Date }>(
            `SELECT id, title, file_name, mime_type, size_bytes, created_at, updated_at FROM documents WHERE user_id = $1`,
            [ownerId]
          )
        : Promise.resolve([]),
    ]);

    res.json({
      requestId: Number(request.id),
      ownerName: owner?.full_name ?? '',
      ownerEmail: owner?.email ?? '',
      passwordsAllowed: contact.allow_passwords,
      cardsAllowed: contact.allow_cards,
      documentsAllowed: contact.allow_documents,
      notesAllowed: contact.allow_notes,
      passwords: passwords.map((p) => ({ id: Number(p.id), itemType: 'PASSWORD', title: p.title, usernameValue: p.username ?? null, encryptedPassword: decryptAtRestSafe(p.password_enc) ?? '', website: p.website ?? null, notes: null, createdAt: p.created_at.toISOString(), updatedAt: p.updated_at.toISOString() })),
      cards: cards.map((c) => ({ id: Number(c.id), itemType: 'CARD', cardName: c.card_name, encryptedCardNumber: decryptAtRestSafe(c.card_number_enc) ?? '', encryptedExpiryDate: decryptAtRestSafe(c.expiry_enc) ?? '', encryptedCvv: decryptAtRestSafe(c.cvv_enc) ?? '', encryptedCardholderName: decryptAtRestSafe(c.cardholder_enc) ?? null, encryptedCardHolderName: decryptAtRestSafe(c.cardholder_enc) ?? null, encryptedNotes: decryptAtRestSafe(c.notes_enc) ?? null, createdAt: c.created_at.toISOString(), updatedAt: c.updated_at.toISOString() })),
      documents: documents.map((d) => ({ id: Number(d.id), itemType: 'DOCUMENT', documentName: d.title, title: d.title, documentType: d.mime_type ?? 'application/octet-stream', mimeType: d.mime_type ?? 'application/octet-stream', sizeBytes: Number(d.size_bytes), fileName: d.file_name, createdAt: d.created_at.toISOString() })),
      notes: notes.map((n) => ({ id: Number(n.id), itemType: 'NOTE', title: n.title, category: n.category ?? null, encryptedContent: decryptAtRestSafe(n.content_enc) ?? '', pinned: n.pinned, createdAt: n.created_at.toISOString(), updatedAt: n.updated_at.toISOString() })),
    });
  })
);

router.get(
  '/requests/:requestId/vault/:itemType/:itemId',
  requireAuth,
  asyncHandler(async (req: AuthedRequest, res) => {
    if (req.sessionMode === 'DURESS') throw notFound();
    const { request, contact } = await loadApprovedRequestAsRequester(req, req.params.requestId);
    const ownerId = Number(request.owner_user_id);
    const itemType = String(req.params.itemType || '').toUpperCase() as VaultCollection;
    const itemId = Number(req.params.itemId);

    if (!allowedTypes(contact).includes(itemType)) throw forbidden('Emergency access does not cover this item type.');

    if (itemType === 'PASSWORD') {
      const p = await row<{ id: number; title: string; website: string | null; username: string | null; password_enc: string; created_at: Date; updated_at: Date }>(
        `SELECT id, title, website, username, password_enc, created_at, updated_at FROM vault_passwords WHERE id = $1 AND user_id = $2`,
        [itemId, ownerId]
      );
      if (!p) throw notFound();
      res.json({ id: Number(p.id), itemType: 'PASSWORD', title: p.title, website: p.website ?? null, usernameValue: p.username ?? null, encryptedPassword: decryptAtRestSafe(p.password_enc) ?? '', createdAt: p.created_at.toISOString(), updatedAt: p.updated_at.toISOString() });
      return;
    }

    if (itemType === 'NOTE') {
      const n = await row<{ id: number; title: string; category: string | null; content_enc: string; pinned: boolean; created_at: Date; updated_at: Date }>(
        `SELECT id, title, category, content_enc, pinned, created_at, updated_at FROM notes WHERE id = $1 AND user_id = $2`,
        [itemId, ownerId]
      );
      if (!n) throw notFound();
      res.json({ id: Number(n.id), itemType: 'NOTE', title: n.title, category: n.category ?? null, encryptedContent: decryptAtRestSafe(n.content_enc) ?? '', pinned: n.pinned, createdAt: n.created_at.toISOString(), updatedAt: n.updated_at.toISOString() });
      return;
    }

    if (itemType === 'DOCUMENT') {
      const d = await row<{ id: number; title: string; file_name: string; mime_type: string | null; size_bytes: number; storage_key: string; created_at: Date; updated_at: Date }>(
        `SELECT id, title, file_name, mime_type, size_bytes, storage_key, created_at, updated_at FROM documents WHERE id = $1 AND user_id = $2`,
        [itemId, ownerId]
      );
      if (!d) throw notFound();
      res.json({ id: Number(d.id), itemType: 'DOCUMENT', documentName: d.title, title: d.title, documentType: d.mime_type ?? 'application/octet-stream', mimeType: d.mime_type ?? 'application/octet-stream', sizeBytes: Number(d.size_bytes), fileName: d.file_name, createdAt: d.created_at.toISOString(), updatedAt: d.updated_at.toISOString() });
      return;
    }

    if (itemType === 'CARD') {
      const c = await row<{ id: number; card_name: string; card_number_enc: string; cardholder_enc: string | null; notes_enc: string | null; created_at: Date; updated_at: Date }>(
        `SELECT id, card_name, card_number_enc, cardholder_enc, notes_enc, created_at, updated_at FROM cards WHERE id = $1 AND user_id = $2`,
        [itemId, ownerId]
      );
      if (!c) throw notFound();
      res.json({ id: Number(c.id), itemType: 'CARD', cardName: c.card_name, encryptedCardNumber: decryptAtRestSafe(c.card_number_enc) ?? '', encryptedExpiryDate: '', encryptedCvv: '', encryptedCardholderName: decryptAtRestSafe(c.cardholder_enc) ?? null, encryptedCardHolderName: decryptAtRestSafe(c.cardholder_enc) ?? null, encryptedNotes: decryptAtRestSafe(c.notes_enc) ?? null, createdAt: c.created_at.toISOString(), updatedAt: c.updated_at.toISOString() });
      return;
    }

    throw notFound('Unsupported item type.');
  })
);

router.get(
  '/requests/:requestId/vault/DOCUMENT/:itemId/download',
  requireAuth,
  asyncHandler(async (req: AuthedRequest, res) => {
    const { request, contact } = await loadApprovedRequestAsRequester(req, req.params.requestId);
    if (!contact.allow_documents) throw forbidden('Emergency access does not cover documents.');
    const ownerId = Number(request.owner_user_id);
    const d = await row<{ storage_key: string; file_name: string; mime_type: string | null }>(
      `SELECT storage_key, file_name, mime_type FROM documents WHERE id = $1 AND user_id = $2`,
      [req.params.itemId, ownerId]
    );
    if (!d) throw notFound();
    const data = await readEncryptedFile(ownerId, d.storage_key);
    res.setHeader('Content-Type', d.mime_type ?? 'application/octet-stream');
    res.setHeader('Content-Length', String(data.length));
    res.send(data);
  })
);

/* ----- Audit ----- */

router.get(
  '/audit',
  requireAuth,
  asyncHandler(async (req: AuthedRequest, res) => {
    const items = await rows<{ id: number; requester_user_id: number; owner_user_id: number; action: string; detail: string | null; created_at: Date }>(
      `SELECT * FROM emergency_audit WHERE owner_user_id = $1 OR requester_user_id = $1 ORDER BY created_at DESC LIMIT 100`,
      [req.userId]
    );
    const actorCache = new Map<number, string>();
    const out = [];
    for (const a of items) {
      const actorId = a.action === 'REQUESTED' ? a.requester_user_id : a.owner_user_id;
      if (!actorCache.has(Number(actorId))) {
        const u = await row<{ email: string }>('SELECT email FROM users WHERE id = $1', [actorId]);
        actorCache.set(Number(actorId), u?.email ?? '');
      }
      out.push({
        id: Number(a.id),
        action: a.action,
        title: String(a.action).replace(/_/g, ' ').toLowerCase().replace(/^./, (c) => c.toUpperCase()),
        message: a.detail ?? null,
        actorEmail: actorCache.get(Number(actorId)) ?? null,
        createdAt: a.created_at.toISOString(),
      });
    }
    res.json(out);
  })
);

export default router;