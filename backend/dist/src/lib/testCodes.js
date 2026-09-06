"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.recordTestCode = recordTestCode;
exports.getTestCode = getTestCode;
exports.clearTestCodes = clearTestCodes;
const env_1 = require("../config/env");
const store = new Map();
/**
 * Test-only store that keeps verification codes readable so integration tests
 * can complete email-code flows. It is only populated when NODE_ENV === 'test'
 * and never in production.
 */
function recordTestCode(email, code) {
    if (env_1.env.NODE_ENV === 'test') {
        store.set(email.toLowerCase(), code);
    }
}
function getTestCode(email) {
    return store.get(email.toLowerCase());
}
function clearTestCodes() {
    store.clear();
}
//# sourceMappingURL=testCodes.js.map