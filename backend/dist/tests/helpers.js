"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.app = void 0;
exports.resetDatabase = resetDatabase;
exports.deviceHeaders = deviceHeaders;
exports.registerAndVerify = registerAndVerify;
exports.loginAs = loginAs;
exports.addPassword = addPassword;
exports.upgradeUser = upgradeUser;
const supertest_1 = __importDefault(require("supertest"));
const app_1 = require("../src/app");
const migrate_1 = require("../src/db/migrate");
const pool_1 = require("../src/db/pool");
const testCodes_1 = require("../src/lib/testCodes");
exports.app = (0, app_1.createApp)();
async function resetDatabase() {
    await (0, migrate_1.migrate)();
    const res = await pool_1.pool.query(`SELECT tablename FROM pg_tables WHERE schemaname = 'public'`);
    const tables = res.rows
        .map((r) => r.tablename)
        .filter((t) => t !== 'schema_migrations');
    if (tables.length > 0) {
        await pool_1.pool.query(`TRUNCATE TABLE ${tables.map((t) => `"${t}"`).join(', ')} CASCADE`);
    }
}
function deviceHeaders(name) {
    return {
        'X-Guardian-Device-Id': `device-${Math.random().toString(36).slice(2, 10)}`,
        'X-Guardian-Device-Name': name,
        'X-Guardian-Device-Type': 'phone',
    };
}
async function registerAndVerify(server, email, password = 'TestPassword123!', device = deviceHeaders('test-device')) {
    const reg = await (0, supertest_1.default)(server)
        .post('/vault/auth/register')
        .send({ email, password, fullname: 'Test User' })
        .set(device);
    if (reg.status !== 201)
        throw new Error(`register failed: ${reg.status} ${JSON.stringify(reg.body)}`);
    const code = (0, testCodes_1.getTestCode)(email);
    if (!code)
        throw new Error(`No test code recorded for ${email}`);
    const verify = await (0, supertest_1.default)(server)
        .post('/vault/auth/verify-registration')
        .send({ email, code })
        .set(device);
    if (verify.status !== 201 && verify.status !== 200) {
        throw new Error(`verify-registration failed: ${verify.status} ${JSON.stringify(verify.body)}`);
    }
    const token = verify.body.token ?? verify.body.jwt ?? verify.body.accessToken;
    const userId = Number(verify.body.userId ?? verify.body.user?.id ?? verify.body.id);
    if (!token || !userId) {
        throw new Error(`no token/userId in verify response: ${JSON.stringify(verify.body)}`);
    }
    return { email, password, token, userId };
}
async function loginAs(server, email, password, headers) {
    const res = await (0, supertest_1.default)(server)
        .post('/vault/auth/login')
        .set(headers)
        .send({ email, password });
    if (res.status !== 200) {
        throw new Error(`login failed: ${res.status} ${JSON.stringify(res.body)}`);
    }
    return res;
}
async function addPassword(server, token, title, passwordValue) {
    const res = await (0, supertest_1.default)(server)
        .post('/api/vault')
        .set('Authorization', `Bearer ${token}`)
        .set(deviceHeaders('test-device'))
        .send({
        itemType: 'PASSWORD',
        title,
        usernameValue: 'user@example.com',
        encryptedPassword: passwordValue,
        website: 'https://example.com',
        notes: 'n',
    });
    return res;
}
async function upgradeUser(server, token, plan) {
    const init = await (0, supertest_1.default)(server)
        .post('/vault/payments/initialize')
        .set('Authorization', `Bearer ${token}`)
        .send({ plan });
    if (init.status !== 201)
        throw new Error(`payment initialize: ${init.status} ${init.body}`);
    const ref = init.body.reference;
    const verify = await (0, supertest_1.default)(server)
        .post('/vault/payments/verify')
        .set('Authorization', `Bearer ${token}`)
        .send({ reference: ref });
    return verify.status;
}
//# sourceMappingURL=helpers.js.map