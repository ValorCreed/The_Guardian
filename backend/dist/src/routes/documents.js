"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const multer_1 = __importDefault(require("multer"));
const zod_1 = require("zod");
const errors_1 = require("../lib/errors");
const pool_1 = require("../db/pool");
const auth_1 = require("../middleware/auth");
const featureGate_1 = require("../middleware/featureGate");
const env_1 = require("../config/env");
const storage_1 = require("../lib/storage");
const router = (0, express_1.Router)({ mergeParams: true });
const upload = (0, multer_1.default)({
    storage: multer_1.default.memoryStorage(),
    limits: { fileSize: env_1.env.MAX_DOCUMENT_BYTES },
});
function toDocument(db) {
    return {
        id: Number(db.id),
        title: db.title,
        documentName: db.title,
        fileName: db.file_name,
        mimeType: db.mime_type ?? 'application/octet-stream',
        documentType: db.mime_type ?? 'application/octet-stream',
        sizeBytes: Number(db.size_bytes),
        encrypted: db.encrypted,
        createdAt: db.created_at.toISOString(),
        updatedAt: db.updated_at.toISOString(),
    };
}
async function isOwner(req, idParam) {
    return (0, pool_1.row)(`SELECT id, user_id, title, file_name, mime_type, size_bytes, storage_key, encrypted, created_at, updated_at
       FROM documents WHERE id = $1 AND user_id = $2`, [idParam, req.userId]);
}
router.post('/upload', upload.single('file'), auth_1.requireAuth, (0, errors_1.asyncHandler)(async (req, res) => {
    if (req.sessionMode === 'DURESS') {
        throw (0, errors_1.forbidden)('Uploads are not available right now.');
    }
    await (0, featureGate_1.requireFeature)(req, 'documentVault');
    const file = req.file;
    if (!file || file.size === 0) {
        throw (0, errors_1.forbidden)('Choose a document to upload.');
    }
    const title = String((req.body?.documentName || file.originalname || 'Document').toString()).trim().slice(0, 200);
    const mimeType = String(req.body?.documentType || file.mimetype || 'application/octet-stream').slice(0, 120);
    const key = (0, storage_1.objectKey)(file.originalname?.split('.').pop?.() || 'bin');
    const written = await (0, storage_1.writeEncryptedFile)(Number(req.userId), key, file.buffer);
    const doc = await (0, pool_1.row)(`INSERT INTO documents (user_id, title, file_name, mime_type, size_bytes, storage_key, encrypted)
       VALUES ($1, $2, $3, $4, $5, $6, true)
       RETURNING id, user_id, title, file_name, mime_type, size_bytes, storage_key, encrypted, created_at, updated_at`, [req.userId, title, String(file.originalname || title).slice(0, 255), mimeType, written, key]);
    res.status(201).json(toDocument(doc));
}));
router.post('/', auth_1.requireAuth, (0, errors_1.asyncHandler)(async (req, res) => {
    if (req.sessionMode === 'DURESS')
        throw (0, errors_1.forbidden)('Storage is not available right now.');
    await (0, featureGate_1.requireFeature)(req, 'documentVault');
    const body = zod_1.z
        .object({
        documentName: zod_1.z.string().trim().min(1).max(200),
        documentType: zod_1.z.string().max(120).optional().nullable(),
        encryptedFileUrl: zod_1.z.string().min(1).max(50_000).optional().nullable(),
        encryptedNotes: zod_1.z.string().max(100_000).optional().nullable(),
    })
        .parse(req.body);
    const doc = await (0, pool_1.row)(`INSERT INTO documents (user_id, title, file_name, mime_type, size_bytes, storage_key, encrypted)
       VALUES ($1, $2, $3, $4, 0, $5, true)
       RETURNING id, user_id, title, file_name, mime_type, size_bytes, storage_key, encrypted, created_at, updated_at`, [
        req.userId,
        body.documentName,
        body.documentName,
        body.documentType ?? 'application/octet-stream',
        (0, storage_1.objectKey)(),
    ]);
    res.status(201).json({
        ...toDocument(doc),
        encryptedFileUrl: body.encryptedFileUrl ?? null,
        encryptedNotes: body.encryptedNotes ?? null,
    });
}));
router.get('/', auth_1.requireAuth, (0, errors_1.asyncHandler)(async (req, res) => {
    if (req.sessionMode === 'DURESS')
        return res.json([]);
    const items = await (0, pool_1.rows)(`SELECT id, user_id, title, file_name, mime_type, size_bytes, storage_key, encrypted, created_at, updated_at
         FROM documents WHERE user_id = $1 ORDER BY updated_at DESC`, [req.userId]);
    res.json(items.map(toDocument));
}));
router.get('/:id', auth_1.requireAuth, (0, errors_1.asyncHandler)(async (req, res) => {
    const doc = await isOwner(req, req.params.id);
    if (!doc)
        throw (0, errors_1.notFound)();
    res.json(toDocument(doc));
}));
router.get('/:id/download', auth_1.requireAuth, (0, errors_1.asyncHandler)(async (req, res) => {
    const doc = await isOwner(req, req.params.id);
    if (!doc)
        throw (0, errors_1.notFound)();
    const data = await (0, storage_1.readEncryptedFile)(Number(req.userId), doc.storage_key);
    res.setHeader('Content-Type', doc.mime_type ?? 'application/octet-stream');
    res.setHeader('Content-Length', String(data.length));
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(doc.file_name || doc.title)}"`);
    res.send(data);
}));
router.put('/:id', auth_1.requireAuth, (0, errors_1.asyncHandler)(async (req, res) => {
    const existing = await isOwner(req, req.params.id);
    if (!existing)
        throw (0, errors_1.notFound)();
    const body = zod_1.z
        .object({
        documentName: zod_1.z.string().trim().min(1).max(200).optional(),
        documentType: zod_1.z.string().max(120).optional().nullable(),
        encryptedNotes: zod_1.z.string().max(100_000).optional().nullable(),
    })
        .parse(req.body);
    const doc = await (0, pool_1.row)(`UPDATE documents SET
          title = COALESCE($3, title),
          file_name = COALESCE($3, file_name),
          mime_type = COALESCE($4, mime_type)
        WHERE id = $1 AND user_id = $2
        RETURNING id, user_id, title, file_name, mime_type, size_bytes, storage_key, encrypted, created_at, updated_at`, [req.params.id, req.userId, body.documentName ?? null, body.documentType ?? null]);
    res.json({ ...toDocument(doc), encryptedNotes: body.encryptedNotes ?? null });
}));
router.delete('/:id', auth_1.requireAuth, (0, errors_1.asyncHandler)(async (req, res) => {
    const doc = await isOwner(req, req.params.id);
    if (!doc)
        throw (0, errors_1.notFound)();
    await (0, storage_1.deleteObject)(Number(req.userId), doc.storage_key);
    await (0, pool_1.query)('DELETE FROM documents WHERE id = $1 AND user_id = $2', [req.params.id, req.userId]);
    res.status(204).send();
}));
exports.default = router;
//# sourceMappingURL=documents.js.map