"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const zod_1 = require("zod");
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const errors_1 = require("../lib/errors");
const pool_1 = require("../db/pool");
const auth_1 = require("../middleware/auth");
const schema_1 = require("../db/schema");
const router = (0, express_1.Router)({ mergeParams: true });
router.get('/me', auth_1.requireAuth, (0, errors_1.asyncHandler)(async (req, res) => {
    const user = await (0, pool_1.row)('SELECT id, email, full_name FROM users WHERE id = $1', [req.userId]);
    if (!user)
        throw (0, errors_1.notFound)();
    res.json({ userId: Number(user.id), fullName: user.full_name || 'Guardian User', email: user.email });
}));
router.put('/me/profile', auth_1.requireAuth, (0, errors_1.asyncHandler)(async (req, res) => {
    const body = zod_1.z.object({ fullName: zod_1.z.string().trim().min(1).max(120) }).parse(req.body);
    const user = await (0, pool_1.row)(`UPDATE users SET full_name = $2, updated_at = now() WHERE id = $1 RETURNING id, email, full_name`, [req.userId, body.fullName]);
    res.json({ userId: Number(user.id), fullName: user.full_name, email: user.email });
}));
router.delete('/me', auth_1.requireAuth, (0, errors_1.asyncHandler)(async (req, res) => {
    const body = zod_1.z.object({ password: zod_1.z.string().min(1) }).parse(req.body);
    const user = await (0, pool_1.row)('SELECT * FROM users WHERE id = $1', [req.userId]);
    if (!user)
        throw (0, errors_1.notFound)();
    const ok = await bcryptjs_1.default.compare(body.password, user.password_hash);
    if (!ok)
        throw new errors_1.ApiError(401, 'Password is incorrect.', 'INVALID_CREDENTIALS');
    await (0, pool_1.query)(`INSERT INTO deleted_accounts (user_id, email) VALUES ($1, $2)`, [user.id, user.email]);
    await (0, schema_1.clearVaultState)(Number(req.userId));
    await (0, pool_1.query)(`DELETE FROM users WHERE id = $1`, [req.userId]);
    res.json({ message: 'Your account and all associated data have been deleted.' });
}));
exports.default = router;
//# sourceMappingURL=users.js.map