import { promises as fs } from 'node:fs';
import path from 'node:path';
import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  createHash,
} from 'node:crypto';
import { env } from '../config/env';

/**
 * File storage with AES-256-GCM encryption at rest.
 *
 * Files land under <STORAGE_DIR>/<userId>/<objectKey>. Each file stores the
 * initialization vector in a sidecar "<key>.iv" file; the ciphertext itself is
 * encrypted with a key derived from VAULT_ENCRYPTION_KEY.
 */

function keyBytes(): Buffer {
  return createHash('sha256').update(Buffer.from(env.VAULT_ENCRYPTION_KEY)).digest();
}

function userDir(userId: number): string {
  return path.join(env.STORAGE_DIR, String(userId));
}

export function objectKey(extension = 'bin'): string {
  return `${randomBytes(16).toString('hex')}.${extension.replace(/[^a-zA-Z0-9.]/g, '').slice(0, 12) || 'bin'}`;
}

export function resolveObjectPath(userId: number, key: string): string {
  return path.join(userDir(userId), path.basename(key));
}

export async function ensureStorageDir(userId: number): Promise<void> {
  await fs.mkdir(userDir(userId), { recursive: true });
}

export async function writeEncryptedFile(userId: number, key: string, data: Buffer): Promise<number> {
  await ensureStorageDir(userId);
  const filePath = resolveObjectPath(userId, key);
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', keyBytes(), iv);
  const ciphertext = Buffer.concat([cipher.update(data), cipher.final()]);
  const tag = cipher.getAuthTag();
  await fs.writeFile(filePath, ciphertext);
  await fs.writeFile(`${filePath}.iv`, Buffer.concat([iv, tag]));
  return data.length;
}

export async function readEncryptedFile(userId: number, key: string): Promise<Buffer> {
  const filePath = resolveObjectPath(userId, key);
  const ciphertext = await fs.readFile(filePath);
  const meta = await fs.readFile(`${filePath}.iv`);
  const iv = meta.subarray(0, 12);
  const tag = meta.subarray(12, 28);
  const decipher = createDecipheriv('aes-256-gcm', keyBytes(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
}

export async function deleteObject(userId: number, key: string): Promise<void> {
  const filePath = resolveObjectPath(userId, key);
  await fs.rm(filePath, { force: true });
  await fs.rm(`${filePath}.iv`, { force: true });
}

export async function fileSize(userId: number, key: string): Promise<number | null> {
  try {
    const stat = await fs.stat(resolveObjectPath(userId, key));
    return stat.size;
  } catch {
    return null;
  }
}