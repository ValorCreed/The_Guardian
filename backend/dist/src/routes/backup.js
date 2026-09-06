"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const zod_1 = require("zod");
const node_crypto_1 = require("node:crypto");
const errors_1 = require("../lib/errors");
const pool_1 = require("../db/pool");
const auth_1 = require("../middleware/auth");
const plan_1 = require("../lib/plan");
const crypto_1 = require("../lib/crypto");
const storage_1 = require("../lib/storage");
const notifications_1 = require("../services/notifications");
const router = (0, express_1.Router)({ mergeParams: true });
async function countTotals(userId) {
    const [pass, card, doc, fm] = await Promise.all([
        (0, pool_1.row)('SELECT COUNT(*)::int AS c FROM vault_passwords WHERE user_id = $1', [userId]),
        (0, pool_1.row)('SELECT COUNT(*)::int AS c FROM cards WHERE user_id = $1', [userId]),
        (0, pool_1.row)('SELECT COUNT(*)::int AS c FROM documents WHERE user_id = $1', [userId]),
        (0, pool_1.row)('SELECT COUNT(*)::int AS c FROM family_memberships WHERE owner_user_id = $1 AND member_user_id IS NOT NULL', [userId]),
    ]);
    return {
        passwordCount: Number(pass?.c ?? 0),
        cardCount: Number(card?.c ?? 0),
        documentCount: Number(doc?.c ?? 0),
        familyMemberCount: Number(fm?.c ?? 0),
    };
}
async function buildBackupPayload(userId) {
    const [passwords, cards, notes, documents, contacts] = await Promise.all([
        (0, pool_1.rows)(`SELECT title, website, username, password_enc, notes_enc, created_at, updated_at FROM vault_passwords WHERE user_id = $1`, [userId]),
        (0, pool_1.rows)(`SELECT card_name, card_number_enc, expiry_enc, cvv_enc, cardholder_enc, notes_enc, created_at, updated_at FROM cards WHERE user_id = $1`, [userId]),
        (0, pool_1.rows)(`SELECT title, content_enc, color, pinned, created_at, updated_at FROM notes WHERE user_id = $1`, [userId]),
        (0, pool_1.rows)(`SELECT title, file_name, mime_type, size_bytes, created_at, updated_at FROM documents WHERE user_id = $1`, [userId]),
        (0, pool_1.rows)(`SELECT name, email, phone, relationship, can_view_vault FROM emergency_contacts WHERE user_id = $1`, [userId]),
    ]);
    return { version: 1, exportedAt: new Date().toISOString(), passwords, cards, notes, documents, contacts };
}
router.get('/status', auth_1.requireAuth, (0, errors_1.asyncHandler)(async (req, res) => {
    const plan = await (0, plan_1.getPlanForUser)(Number(req.userId));
    const allowed = (plan === 'PREMIUM' || plan === 'FAMILY') && req.sessionMode !== 'DURESS';
    const totals = allowed ? await countTotals(Number(req.userId)) : { passwordCount: 0, cardCount: 0, documentCount: 0, familyMemberCount: 0 };
    res.json({
        allowed,
        plan,
        message: allowed ? 'Backup is available on your plan.' : 'Cloud backup is available on Premium and Family plans.',
        totalItemCount: totals.passwordCount + totals.cardCount + totals.documentCount + totals.familyMemberCount,
        ...totals,
    });
}));
router.post('/create', auth_1.requireAuth, (0, errors_1.asyncHandler)(async (req, res) => {
    if (req.sessionMode === 'DURESS')
        throw new errors_1.ApiError(403, 'Not available in this session.', 'FORBIDDEN');
    const plan = await (0, plan_1.getPlanForUser)(Number(req.userId));
    if (plan === 'FREE')
        throw new errors_1.ApiError(403, 'Cloud backup is available on Premium and Family plans.', 'PLAN_LIMIT_REACHED');
    const payload = await buildBackupPayload(Number(req.userId));
    const encryptedBackup = (0, crypto_1.encryptAtRest)(JSON.stringify(payload));
    const checksum = (0, node_crypto_1.createHash)('sha256').update(encryptedBackup).digest('hex');
    const key = (0, storage_1.objectKey)('backup');
    await (0, storage_1.writeEncryptedFile)(Number(req.userId), key, Buffer.from(encryptedBackup, 'utf8'));
    await (0, pool_1.query)(`DELETE FROM backup_files WHERE user_id = $1 AND replaced = false`, [req.userId]);
    await (0, pool_1.query)(`INSERT INTO backup_files (user_id, storage_key, size_bytes) VALUES ($1, $2, $3)`, [req.userId, key, Buffer.byteLength(encryptedBackup, 'utf8')]);
    const totals = await countTotals(Number(req.userId));
    const backupSizeBytes = Buffer.byteLength(encryptedBackup, 'utf8');
    await (0, notifications_1.createNotification)({
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
}));
router.post('/restore', auth_1.requireAuth, (0, errors_1.asyncHandler)(async (req, res) => {
    if (req.sessionMode === 'DURESS')
        throw new errors_1.ApiError(403, 'Not available in this session.', 'FORBIDDEN');
    const plan = await (0, plan_1.getPlanForUser)(Number(req.userId));
    if (plan === 'FREE')
        throw new errors_1.ApiError(403, 'Cloud backup is available on Premium and Family plans.', 'PLAN_LIMIT_REACHED');
    const body = zod_1.z.object({ encryptedBackup: zod_1.z.string().min(1), replaceExisting: zod_1.z.boolean().optional() }).parse(req.body);
    let payload;
    try {
        payload = parsePayload((0, crypto_1.decryptAtRest)(body.encryptedBackup));
    }
    catch {
        throw new errors_1.ApiError(400, 'The backup payload could not be decrypted. It may be corrupt.', 'INVALID_BACKUP');
    }
    if (body.replaceExisting) {
        await (0, pool_1.query)(`DELETE FROM vault_passwords WHERE user_id = $1`, [req.userId]);
        await (0, pool_1.query)(`DELETE FROM cards WHERE user_id = $1`, [req.userId]);
        await (0, pool_1.query)(`DELETE FROM notes WHERE user_id = $1`, [req.userId]);
    }
    let passwordCount = 0;
    let cardCount = 0;
    let documentCount = 0;
    for (const item of payload.passwords) {
        await (0, pool_1.query)(`INSERT INTO vault_passwords (user_id, title, website, username, password_enc, notes_enc, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, now(), now())`, [req.userId, item.title ?? 'Untitled', item.website ?? null, item.username ?? null, item.password_enc ?? '', item.notes_enc ?? null]);
        passwordCount += 1;
    }
    for (const item of payload.cards) {
        await (0, pool_1.query)(`INSERT INTO cards (user_id, card_name, card_number_enc, expiry_enc, cvv_enc, cardholder_enc, notes_enc, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, now(), now())`, [req.userId, item.card_name ?? '', item.card_number_enc ?? '', item.expiry_enc ?? null, item.cvv_enc ?? null, item.cardholder_enc ?? null, item.notes_enc ?? null]);
        cardCount += 1;
    }
    for (const item of payload.notes) {
        await (0, pool_1.query)(`INSERT INTO notes (user_id, title, content_enc, color, pinned, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, now(), now())`, [req.userId, item.title ?? 'Untitled', item.content_enc ?? '', item.color ?? null, Boolean(item.pinned)]);
        documentCount += 1;
    }
    // Documents require their encrypted blobs, which are stored server-side; a
    // cloud backup therefore references document metadata only. Metadata is
    // restored so the vault listing stays consistent. If replaceExisting is
    // true the restored metadata replaces the previous list.
    if (body.replaceExisting) {
        await (0, pool_1.query)(`DELETE FROM documents WHERE user_id = $1`, [req.userId]);
    }
    for (const item of payload.documents) {
        await (0, pool_1.query)(`INSERT INTO documents (user_id, title, file_name, mime_type, size_bytes, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, now(), now())`, [req.userId, item.title ?? 'Untitled', item.file_name ?? 'document', item.mime_type ?? null, Number(item.size_bytes ?? 0)]);
        documentCount += 1;
    }
    await (0, notifications_1.createNotification)({
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
}));
function parsePayload(json) {
    const parsed = JSON.parse(json);
    const as = (v) => (v ?? []);
    return {
        passwords: as(parsed.passwords),
        cards: as(parsed.cards),
        notes: as(parsed.notes),
        documents: as(parsed.documents),
    };
}
exports.default = router;
//# sourceMappingURL=backup.js.map