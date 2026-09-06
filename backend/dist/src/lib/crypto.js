"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.encryptAtRest = encryptAtRest;
exports.decryptAtRest = decryptAtRest;
exports.decryptAtRestSafe = decryptAtRestSafe;
exports.sha256Hex = sha256Hex;
const node_crypto_1 = require("node:crypto");
const env_1 = require("../config/env");
/**
 * AES-256-GCM encryption at rest.
 *
 * The Guardian client sends plaintext in its `encrypted*` fields; the server
 * encrypts those values before writing them to storage. The key is held by the
 * server (VAULT_ENCRYPTION_KEY), so this is NOT a zero-knowledge design — the
 * server can decrypt vault data. See docs/backend-technical-documentation.md.
 *
 * Format: `v1.<iv base64url>.<authTag base64url>.<ciphertext base64url>`
 */
function keyBytes() {
    const key = Buffer.from(env_1.env.VAULT_ENCRYPTION_KEY);
    return (0, node_crypto_1.createHash)('sha256').update(key).digest();
}
function encryptAtRest(plaintext) {
    const iv = (0, node_crypto_1.randomBytes)(12);
    const cipher = (0, node_crypto_1.createCipheriv)('aes-256-gcm', keyBytes(), iv);
    const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return `v1.${iv.toString('base64url')}.${tag.toString('base64url')}.${ciphertext.toString('base64url')}`;
}
function decryptAtRest(payload) {
    const parts = payload.split('.');
    if (parts[0] !== 'v1' || parts.length !== 4) {
        throw new Error('Invalid encrypted payload format.');
    }
    const iv = Buffer.from(parts[1], 'base64url');
    const tag = Buffer.from(parts[2], 'base64url');
    const ciphertext = Buffer.from(parts[3], 'base64url');
    const decipher = (0, node_crypto_1.createDecipheriv)('aes-256-gcm', keyBytes(), iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
}
function decryptAtRestSafe(payload) {
    if (!payload)
        return null;
    try {
        return decryptAtRest(payload);
    }
    catch {
        return null;
    }
}
/** SHA-256 hex digest; used for biometric credentials and verification codes. */
function sha256Hex(value) {
    return (0, node_crypto_1.createHash)('sha256').update(value).digest('hex');
}
//# sourceMappingURL=crypto.js.map