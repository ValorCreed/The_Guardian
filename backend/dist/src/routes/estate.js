"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const zod_1 = require("zod");
const errors_1 = require("../lib/errors");
const pool_1 = require("../db/pool");
const auth_1 = require("../middleware/auth");
const plan_1 = require("../lib/plan");
const crypto_1 = require("../lib/crypto");
const storage_1 = require("../lib/storage");
const router = (0, express_1.Router)({ mergeParams: true });
const bodySchema = zod_1.z.object({
    itemType: zod_1.z.enum(['PASSWORD', 'CARD', 'DOCUMENT', 'NOTE']),
    itemId: zod_1.z.number().int().positive(),
    actionType: zod_1.z.enum(['RELEASE', 'TRANSFER', 'CANCEL', 'DELETE', 'ARCHIVE']),
    triggerType: zod_1.z.enum(['OWNER_RELEASE', 'EMERGENCY_APPROVAL', 'SAFETY_CHECK']).default('OWNER_RELEASE'),
    recipientContactId: zod_1.z.number().int().positive().nullable().optional(),
    instructions: zod_1.z.string().max(2000).optional().nullable(),
});
const ITEM_TABLE = {
    PASSWORD: 'vault_passwords',
    CARD: 'cards',
    DOCUMENT: 'documents',
    NOTE: 'notes',
};
async function titleFor(itemType, itemId) {
    const table = ITEM_TABLE[itemType];
    if (!table)
        return 'Item';
    const r = await (0, pool_1.row)(`SELECT title FROM ${table} WHERE id = $1`, [itemId]);
    return r?.title ?? 'Item';
}
async function ownerPlaybook(req, id) {
    const p = await (0, pool_1.row)(`SELECT * FROM estate_playbooks WHERE id = $1 AND user_id = $2`, [id, req.userId]);
    if (!p)
        throw (0, errors_1.notFound)('No estate playbook found.');
    return p;
}
function toPlaybook(p) {
    const config = (p.trigger_config ?? {});
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
async function toExecution(e, forRecipient) {
    const owner = await (0, pool_1.row)('SELECT full_name, email FROM users WHERE id = $1', [e.user_id]);
    const recipient = e.recipient_user_id
        ? await (0, pool_1.row)('SELECT full_name, email FROM users WHERE id = $1', [e.recipient_user_id])
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
router.get('/', auth_1.requireAuth, (0, errors_1.asyncHandler)(async (req, res) => {
    if (req.sessionMode === 'DURESS') {
        return res.json({ plan: 'FREE', eligible: false, canConfigure: false, vaultAvailable: false, contacts: [], vaultItems: [], playbooks: [], releasedByMe: [], received: [], message: 'Unavailable in this session.' });
    }
    const plan = await (0, plan_1.getPlanForUser)(Number(req.userId));
    const eligible = plan === 'FAMILY';
    const contacts = await (0, pool_1.rows)(`SELECT id, name, email, relationship FROM emergency_contacts WHERE user_id = $1 AND email IS NOT NULL`, [req.userId]);
    const vaultItems = await (0, pool_1.rows)(`SELECT 'PASSWORD' AS table, id, title, updated_at FROM vault_passwords WHERE user_id = $1
       UNION ALL SELECT 'CARD', id, card_name, updated_at FROM cards WHERE user_id = $1
       UNION ALL SELECT 'DOCUMENT', id, title, updated_at FROM documents WHERE user_id = $1
       UNION ALL SELECT 'NOTE', id, title, updated_at FROM notes WHERE user_id = $1`, [req.userId]);
    const playbooks = await (0, pool_1.rows)('SELECT * FROM estate_playbooks WHERE user_id = $1 ORDER BY updated_at DESC', [req.userId]);
    const releasedByMe = await (0, pool_1.rows)('SELECT * FROM estate_executions WHERE user_id = $1 ORDER BY released_at DESC', [req.userId]);
    const received = await (0, pool_1.rows)(`SELECT * FROM estate_executions WHERE recipient_user_id = $1 ORDER BY released_at DESC`, [req.userId]);
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
}));
router.post('/', auth_1.requireAuth, (0, errors_1.asyncHandler)(async (req, res) => {
    if (req.sessionMode === 'DURESS')
        throw (0, errors_1.forbidden)('Not available in this session.');
    const plan = await (0, plan_1.getPlanForUser)(Number(req.userId));
    if (plan !== 'FAMILY')
        throw new errors_1.ApiError(403, 'Estate planning is available on the Family plan.', 'PLAN_LIMIT_REACHED');
    const body = bodySchema.parse(req.body);
    const itemTitle = await titleFor(body.itemType, body.itemId);
    const p = await (0, pool_1.row)(`INSERT INTO estate_playbooks (user_id, title, trigger_config, release_after_days, status)
       VALUES ($1, $2, $3, 30, 'ACTIVE')
       RETURNING *`, [req.userId, `${body.actionType} ${itemTitle}`, JSON.stringify({ itemType: body.itemType, itemId: body.itemId, actionType: body.actionType, triggerType: body.triggerType, recipientContactId: body.recipientContactId ?? null, instructions: body.instructions ?? null })]);
    res.status(201).json(toPlaybook(p));
}));
router.get('/:id', auth_1.requireAuth, (0, errors_1.asyncHandler)(async (req, res) => {
    const p = await ownerPlaybook(req, req.params.id);
    res.json(toPlaybook(p));
}));
router.put('/:id', auth_1.requireAuth, (0, errors_1.asyncHandler)(async (req, res) => {
    const existing = await ownerPlaybook(req, req.params.id);
    const body = zod_1.z.object({ status: zod_1.z.enum(['ACTIVE', 'PAUSED']).optional() }).parse(req.body);
    const p = await (0, pool_1.row)(`UPDATE estate_playbooks SET status = COALESCE($2, status), updated_at = now()
        WHERE id = $1 RETURNING *`, [existing.id, body.status ?? null]);
    res.json(toPlaybook(p));
}));
router.delete('/:id', auth_1.requireAuth, (0, errors_1.asyncHandler)(async (req, res) => {
    await ownerPlaybook(req, req.params.id);
    await (0, pool_1.query)('DELETE FROM estate_playbooks WHERE id = $1', [req.params.id]);
    res.status(204).send();
}));
router.post('/:id/pause', auth_1.requireAuth, (0, errors_1.asyncHandler)(async (req, res) => {
    const existing = await ownerPlaybook(req, req.params.id);
    const p = await (0, pool_1.row)(`UPDATE estate_playbooks SET status = 'PAUSED', updated_at = now() WHERE id = $1 RETURNING *`, [existing.id]);
    res.json(toPlaybook(p));
}));
router.post('/:id/resume', auth_1.requireAuth, (0, errors_1.asyncHandler)(async (req, res) => {
    const existing = await ownerPlaybook(req, req.params.id);
    const p = await (0, pool_1.row)(`UPDATE estate_playbooks SET status = 'ACTIVE', updated_at = now() WHERE id = $1 RETURNING *`, [existing.id]);
    res.json(toPlaybook(p));
}));
router.post('/:id/release', auth_1.requireAuth, (0, errors_1.asyncHandler)(async (req, res) => {
    const p = await ownerPlaybook(req, req.params.id);
    const config = (p.trigger_config ?? {});
    let recipientUserId = null;
    if (config.recipientContactId) {
        const contact = await (0, pool_1.row)('SELECT email FROM emergency_contacts WHERE id = $1 AND user_id = $2', [config.recipientContactId, req.userId]);
        if (contact) {
            const recipientUser = await (0, pool_1.row)('SELECT id FROM users WHERE lower(email) = lower($1)', [contact.email]);
            recipientUserId = recipientUser ? Number(recipientUser.id) : null;
        }
    }
    const execution = await (0, pool_1.row)(`INSERT INTO estate_executions
         (playbook_id, user_id, recipient_user_id, item_type, item_id, item_title, action_type, source_type, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'OWNER_RELEASE', 'RELEASED')
       RETURNING *`, [p.id, req.userId, recipientUserId, config.itemType ?? 'NOTE', config.itemId ?? Number(p.id), p.title, config.actionType ?? 'RELEASE']);
    res.status(201).json(await toExecution(execution, false));
}));
async function loadExecution(req, id) {
    const e = await (0, pool_1.row)('SELECT * FROM estate_executions WHERE id = $1', [id]);
    if (!e || (Number(e.user_id) !== Number(req.userId) && Number(e.recipient_user_id) !== Number(req.userId))) {
        throw (0, errors_1.notFound)('No execution found.');
    }
    return e;
}
async function releasedItemPayload(req, e) {
    const owner = await (0, pool_1.row)('SELECT full_name, email FROM users WHERE id = $1', [e.user_id]);
    const viewUpdate = await (0, pool_1.row)(`UPDATE estate_executions SET viewed_at = COALESCE(viewed_at, now()) WHERE id = $1 RETURNING *`, [e.id]);
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
        const item = await (0, pool_1.row)(`SELECT * FROM vault_passwords WHERE id = $1`, [e.item_id]);
        return { ...base, title: item?.title ?? e.item_title, usernameValue: item?.username_value ?? null, password: item ? (0, crypto_1.decryptAtRestSafe)(item.password_enc) : null, website: item?.website ?? null, notes: item ? (0, crypto_1.decryptAtRestSafe)(item.notes_enc) : null, itemCreatedAt: item?.created_at.toISOString() ?? null, itemUpdatedAt: item?.updated_at.toISOString() ?? null };
    }
    if (e.item_type === 'NOTE') {
        const item = await (0, pool_1.row)(`SELECT * FROM notes WHERE id = $1`, [e.item_id]);
        return { ...base, title: item?.title ?? e.item_title, category: item?.category ?? null, content: item ? (0, crypto_1.decryptAtRestSafe)(item.content_enc) : null, pinned: item?.pinned ?? null, itemCreatedAt: item?.created_at.toISOString() ?? null, itemUpdatedAt: item?.updated_at.toISOString() ?? null };
    }
    if (e.item_type === 'CARD') {
        const item = await (0, pool_1.row)(`SELECT * FROM cards WHERE id = $1`, [e.item_id]);
        return { ...base, title: item?.card_name ?? e.item_title, cardName: item?.card_name ?? null, cardNumber: item ? (0, crypto_1.decryptAtRestSafe)(item.card_number_enc) : null, cardholderName: item ? (0, crypto_1.decryptAtRestSafe)(item.cardholder_enc) : null, documentNotes: item ? (0, crypto_1.decryptAtRestSafe)(item.notes_enc) : null, itemCreatedAt: item?.created_at.toISOString() ?? null, itemUpdatedAt: item?.updated_at.toISOString() ?? null };
    }
    if (e.item_type === 'DOCUMENT') {
        const item = await (0, pool_1.row)(`SELECT * FROM documents WHERE id = $1`, [e.item_id]);
        return { ...base, title: item?.title ?? e.item_title, documentName: item?.file_name ?? null, documentType: item?.mime_type ?? null, sizeBytes: item ? Number(item.size_bytes) : null, itemCreatedAt: item?.created_at.toISOString() ?? null, itemUpdatedAt: item?.updated_at.toISOString() ?? null };
    }
    return base;
}
router.get('/executions/:id/item', auth_1.requireAuth, (0, errors_1.asyncHandler)(async (req, res) => {
    const e = await loadExecution(req, req.params.id);
    if (Number(e.recipient_user_id) !== Number(req.userId))
        throw (0, errors_1.forbidden)('Only the recipient can open this released item.');
    res.json(await releasedItemPayload(req, e));
}));
router.get('/executions/:id/document', auth_1.requireAuth, (0, errors_1.asyncHandler)(async (req, res) => {
    const e = await loadExecution(req, req.params.id);
    if (Number(e.recipient_user_id) !== Number(req.userId))
        throw (0, errors_1.forbidden)('Only the recipient can download this document.');
    const item = await (0, pool_1.row)(`SELECT storage_key, file_name, mime_type FROM documents WHERE id = $1`, [e.item_id]);
    if (!item)
        throw (0, errors_1.notFound)();
    const data = await (0, storage_1.readEncryptedFile)(Number(e.user_id), item.storage_key);
    res.setHeader('Content-Type', item.mime_type ?? 'application/octet-stream');
    res.send(data);
}));
router.post('/executions/:id/cancel', auth_1.requireAuth, (0, errors_1.asyncHandler)(async (req, res) => {
    const e = await loadExecution(req, req.params.id);
    if (Number(e.user_id) !== Number(req.userId))
        throw (0, errors_1.forbidden)('Only the owner can cancel this execution.');
    const updated = await (0, pool_1.row)(`UPDATE estate_executions SET status = 'CANCELLED', cancelled_at = now() WHERE id = $1 RETURNING *`, [e.id]);
    res.json(await toExecution(updated, false));
}));
router.post('/executions/:id/complete', auth_1.requireAuth, (0, errors_1.asyncHandler)(async (req, res) => {
    const e = await loadExecution(req, req.params.id);
    if (Number(e.recipient_user_id) !== Number(req.userId))
        throw (0, errors_1.forbidden)('Only the recipient can complete this execution.');
    const updated = await (0, pool_1.row)(`UPDATE estate_executions SET status = 'COMPLETED', completed_at = now() WHERE id = $1 RETURNING *`, [e.id]);
    res.json(await toExecution(updated, true));
}));
exports.default = router;
//# sourceMappingURL=estate.js.map