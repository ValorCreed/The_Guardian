"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateSixDigitCode = generateSixDigitCode;
exports.generateNineDigitCode = generateNineDigitCode;
exports.safeEqual = safeEqual;
exports.randomToken = randomToken;
const node_crypto_1 = require("node:crypto");
/** Generate a cryptographically random 6-digit code, e.g. for email verification. */
function generateSixDigitCode() {
    return String((0, node_crypto_1.randomInt)(0, 1_000_000)).padStart(6, '0');
}
/**
 * Format a 9-digit emergency access code.
 */
function generateNineDigitCode() {
    return String((0, node_crypto_1.randomInt)(0, 1_000_000_000)).padStart(9, '0');
}
/** Timing-safe string comparison. */
function safeEqual(a, b) {
    if (a.length !== b.length)
        return false;
    let diff = 0;
    for (let i = 0; i < a.length; i += 1)
        diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
    return diff === 0;
}
/** Random URL-safe token used for credential tokens, recovery circle public ids etc. */
function randomToken(bytes = 32) {
    return require('crypto').randomBytes(bytes).toString('base64url');
}
//# sourceMappingURL=codes.js.map