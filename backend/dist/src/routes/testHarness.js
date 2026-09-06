"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const env_1 = require("../config/env");
const errors_1 = require("../lib/errors");
const testCodes_1 = require("../lib/testCodes");
/**
 * Test-only harness. Mounted ONLY in test environments (NODE_ENV === 'test')
 * so live integration tests can read the verification codes the app would
 * deliver over email. Never enabled in production.
 */
const router = (0, express_1.Router)();
router.get('/codes/:email', (0, errors_1.asyncHandler)(async (req, res) => {
    if (env_1.env.NODE_ENV !== 'test')
        throw (0, errors_1.notFound)();
    const code = (0, testCodes_1.getTestCode)(req.params.email);
    if (!code)
        throw (0, errors_1.notFound)('No pending code for this email.');
    res.json({ email: req.params.email, code });
}));
exports.default = router;
//# sourceMappingURL=testHarness.js.map