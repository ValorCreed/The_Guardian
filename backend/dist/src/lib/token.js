"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.signUserToken = signUserToken;
exports.verifyUserToken = verifyUserToken;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const env_1 = require("../config/env");
function signUserToken(payload) {
    return jsonwebtoken_1.default.sign({ sid: payload.sid, mode: payload.mode, deviceId: payload.deviceId ?? undefined }, env_1.env.JWT_SECRET, { subject: String(payload.sub), expiresIn: env_1.env.JWT_EXPIRES_IN });
}
function verifyUserToken(token) {
    const decoded = jsonwebtoken_1.default.verify(token, env_1.env.JWT_SECRET);
    if (!decoded.sub || !decoded.sid) {
        throw new Error('Malformed token.');
    }
    return {
        sub: decoded.sub,
        sid: decoded.sid,
        mode: decoded.mode === 'DURESS' ? 'DURESS' : 'NORMAL',
        deviceId: decoded.deviceId ?? null,
    };
}
//# sourceMappingURL=token.js.map