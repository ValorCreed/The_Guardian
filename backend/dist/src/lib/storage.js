"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.objectKey = objectKey;
exports.resolveObjectPath = resolveObjectPath;
exports.ensureStorageDir = ensureStorageDir;
exports.writeEncryptedFile = writeEncryptedFile;
exports.readEncryptedFile = readEncryptedFile;
exports.deleteObject = deleteObject;
exports.fileSize = fileSize;
const node_fs_1 = require("node:fs");
const node_path_1 = __importDefault(require("node:path"));
const node_crypto_1 = require("node:crypto");
const env_1 = require("../config/env");
/**
 * File storage with AES-256-GCM encryption at rest.
 *
 * Files land under <STORAGE_DIR>/<userId>/<objectKey>. Each file stores the
 * initialization vector in a sidecar "<key>.iv" file; the ciphertext itself is
 * encrypted with a key derived from VAULT_ENCRYPTION_KEY.
 */
function keyBytes() {
    return (0, node_crypto_1.createHash)('sha256').update(Buffer.from(env_1.env.VAULT_ENCRYPTION_KEY)).digest();
}
function userDir(userId) {
    return node_path_1.default.join(env_1.env.STORAGE_DIR, String(userId));
}
function objectKey(extension = 'bin') {
    return `${(0, node_crypto_1.randomBytes)(16).toString('hex')}.${extension.replace(/[^a-zA-Z0-9.]/g, '').slice(0, 12) || 'bin'}`;
}
function resolveObjectPath(userId, key) {
    return node_path_1.default.join(userDir(userId), node_path_1.default.basename(key));
}
async function ensureStorageDir(userId) {
    await node_fs_1.promises.mkdir(userDir(userId), { recursive: true });
}
async function writeEncryptedFile(userId, key, data) {
    await ensureStorageDir(userId);
    const filePath = resolveObjectPath(userId, key);
    const iv = (0, node_crypto_1.randomBytes)(12);
    const cipher = (0, node_crypto_1.createCipheriv)('aes-256-gcm', keyBytes(), iv);
    const ciphertext = Buffer.concat([cipher.update(data), cipher.final()]);
    const tag = cipher.getAuthTag();
    await node_fs_1.promises.writeFile(filePath, ciphertext);
    await node_fs_1.promises.writeFile(`${filePath}.iv`, Buffer.concat([iv, tag]));
    return data.length;
}
async function readEncryptedFile(userId, key) {
    const filePath = resolveObjectPath(userId, key);
    const ciphertext = await node_fs_1.promises.readFile(filePath);
    const meta = await node_fs_1.promises.readFile(`${filePath}.iv`);
    const iv = meta.subarray(0, 12);
    const tag = meta.subarray(12, 28);
    const decipher = (0, node_crypto_1.createDecipheriv)('aes-256-gcm', keyBytes(), iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
}
async function deleteObject(userId, key) {
    const filePath = resolveObjectPath(userId, key);
    await node_fs_1.promises.rm(filePath, { force: true });
    await node_fs_1.promises.rm(`${filePath}.iv`, { force: true });
}
async function fileSize(userId, key) {
    try {
        const stat = await node_fs_1.promises.stat(resolveObjectPath(userId, key));
        return stat.size;
    }
    catch {
        return null;
    }
}
//# sourceMappingURL=storage.js.map