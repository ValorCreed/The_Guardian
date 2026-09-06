import { Router, type Request } from 'express';
import multer from 'multer';
import { z } from 'zod';

import { asyncHandler, notFound, forbidden } from '../lib/errors';
import { query, row, rows } from '../db/pool';
import { requireAuth, type AuthedRequest } from '../middleware/auth';
import { requireFeature } from '../middleware/featureGate';
import { env } from '../config/env';
import { objectKey, writeEncryptedFile, readEncryptedFile, deleteObject } from '../lib/storage';

const router = Router({ mergeParams: true });

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: env.MAX_DOCUMENT_BYTES },
});

type DocumentRow = {
  id: number;
  user_id: number;
  title: string;
  file_name: string;
  mime_type: string | null;
  size_bytes: number;
  storage_key: string;
  encrypted: boolean;
  created_at: Date;
  updated_at: Date;
};

function toDocument(db: DocumentRow) {
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

async function isOwner(req: AuthedRequest, idParam: string): Promise<DocumentRow | null> {
  return row<DocumentRow>(
    `SELECT id, user_id, title, file_name, mime_type, size_bytes, storage_key, encrypted, created_at, updated_at
       FROM documents WHERE id = $1 AND user_id = $2`,
    [idParam, req.userId]
  );
}

router.post(
  '/upload',
  upload.single('file'),
  requireAuth,
  asyncHandler(async (req: AuthedRequest, res) => {
    if (req.sessionMode === 'DURESS') {
      throw forbidden('Uploads are not available right now.');
    }
    await requireFeature(req, 'documentVault');

    const file = (req as Request & { file?: Express.Multer.File }).file;
    if (!file || file.size === 0) {
      throw forbidden('Choose a document to upload.');
    }

    const title = String((req.body?.documentName || file.originalname || 'Document').toString()).trim().slice(0, 200);
    const mimeType = String(req.body?.documentType || file.mimetype || 'application/octet-stream').slice(0, 120);

    const key = objectKey(file.originalname?.split('.').pop?.() || 'bin');
    const written = await writeEncryptedFile(Number(req.userId), key, file.buffer);

    const doc = await row<DocumentRow>(
      `INSERT INTO documents (user_id, title, file_name, mime_type, size_bytes, storage_key, encrypted)
       VALUES ($1, $2, $3, $4, $5, $6, true)
       RETURNING id, user_id, title, file_name, mime_type, size_bytes, storage_key, encrypted, created_at, updated_at`,
      [req.userId, title, String(file.originalname || title).slice(0, 255), mimeType, written, key]
    );

    res.status(201).json(toDocument(doc!));
  })
);

router.post(
  '/',
  requireAuth,
  asyncHandler(async (req: AuthedRequest, res) => {
    if (req.sessionMode === 'DURESS') throw forbidden('Storage is not available right now.');
    await requireFeature(req, 'documentVault');

    const body = z
      .object({
        documentName: z.string().trim().min(1).max(200),
        documentType: z.string().max(120).optional().nullable(),
        encryptedFileUrl: z.string().min(1).max(50_000).optional().nullable(),
        encryptedNotes: z.string().max(100_000).optional().nullable(),
      })
      .parse(req.body);

    const doc = await row<DocumentRow>(
      `INSERT INTO documents (user_id, title, file_name, mime_type, size_bytes, storage_key, encrypted)
       VALUES ($1, $2, $3, $4, 0, $5, true)
       RETURNING id, user_id, title, file_name, mime_type, size_bytes, storage_key, encrypted, created_at, updated_at`,
      [
        req.userId,
        body.documentName,
        body.documentName,
        body.documentType ?? 'application/octet-stream',
        objectKey(),
      ]
    );

    res.status(201).json({
      ...toDocument(doc!),
      encryptedFileUrl: body.encryptedFileUrl ?? null,
      encryptedNotes: body.encryptedNotes ?? null,
    });
  })
);

router.get(
  '/',
  requireAuth,
  asyncHandler(async (req: AuthedRequest, res) => {
    if (req.sessionMode === 'DURESS') return res.json([]);
    const items = await rows<DocumentRow>(
      `SELECT id, user_id, title, file_name, mime_type, size_bytes, storage_key, encrypted, created_at, updated_at
         FROM documents WHERE user_id = $1 ORDER BY updated_at DESC`,
      [req.userId]
    );
    res.json(items.map(toDocument));
  })
);

router.get(
  '/:id',
  requireAuth,
  asyncHandler(async (req: AuthedRequest, res) => {
    const doc = await isOwner(req, req.params.id);
    if (!doc) throw notFound();
    res.json(toDocument(doc));
  })
);

router.get(
  '/:id/download',
  requireAuth,
  asyncHandler(async (req: AuthedRequest, res) => {
    const doc = await isOwner(req, req.params.id);
    if (!doc) throw notFound();

    const data = await readEncryptedFile(Number(req.userId), doc.storage_key);
    res.setHeader('Content-Type', doc.mime_type ?? 'application/octet-stream');
    res.setHeader('Content-Length', String(data.length));
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${encodeURIComponent(doc.file_name || doc.title)}"`
    );
    res.send(data);
  })
);

router.put(
  '/:id',
  requireAuth,
  asyncHandler(async (req: AuthedRequest, res) => {
    const existing = await isOwner(req, req.params.id);
    if (!existing) throw notFound();

    const body = z
      .object({
        documentName: z.string().trim().min(1).max(200).optional(),
        documentType: z.string().max(120).optional().nullable(),
        encryptedNotes: z.string().max(100_000).optional().nullable(),
      })
      .parse(req.body);

    const doc = await row<DocumentRow>(
      `UPDATE documents SET
          title = COALESCE($3, title),
          file_name = COALESCE($3, file_name),
          mime_type = COALESCE($4, mime_type)
        WHERE id = $1 AND user_id = $2
        RETURNING id, user_id, title, file_name, mime_type, size_bytes, storage_key, encrypted, created_at, updated_at`,
      [req.params.id, req.userId, body.documentName ?? null, body.documentType ?? null]
    );
    res.json({ ...toDocument(doc!), encryptedNotes: body.encryptedNotes ?? null });
  })
);

router.delete(
  '/:id',
  requireAuth,
  asyncHandler(async (req: AuthedRequest, res) => {
    const doc = await isOwner(req, req.params.id);
    if (!doc) throw notFound();
    await deleteObject(Number(req.userId), doc.storage_key);
    await query('DELETE FROM documents WHERE id = $1 AND user_id = $2', [req.params.id, req.userId]);
    res.status(204).send();
  })
);

export default router;