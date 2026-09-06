"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.globalLimiter = exports.codeLimiter = exports.authLimiter = void 0;
const express_rate_limit_1 = __importDefault(require("express-rate-limit"));
const env_1 = require("../config/env");
const standardHeaders = true;
const legacyHeaders = false;
exports.authLimiter = (0, express_rate_limit_1.default)({
    windowMs: 15 * 60_000,
    limit: 20,
    standardHeaders,
    legacyHeaders,
    skip: () => env_1.env.NODE_ENV === 'test',
    message: { message: 'Too many authentication attempts. Try again in a few minutes.', code: 'RATE_LIMITED' },
});
exports.codeLimiter = (0, express_rate_limit_1.default)({
    windowMs: 15 * 60_000,
    limit: 30,
    standardHeaders,
    legacyHeaders,
    skip: () => env_1.env.NODE_ENV === 'test',
    message: { message: 'Too many code verification attempts. Try again in a few minutes.', code: 'RATE_LIMITED' },
});
exports.globalLimiter = (0, express_rate_limit_1.default)({
    windowMs: 15 * 60_000,
    limit: 600,
    standardHeaders,
    legacyHeaders,
    skip: () => env_1.env.NODE_ENV === 'test',
    message: { message: 'Too many requests. Please slow down.', code: 'RATE_LIMITED' },
});
//# sourceMappingURL=rateLimit.js.map