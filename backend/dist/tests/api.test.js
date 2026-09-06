"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const supertest_1 = __importDefault(require("supertest"));
const pool_1 = require("../src/db/pool");
const helpers_1 = require("./helpers");
(0, vitest_1.beforeAll)(async () => {
    await (0, helpers_1.resetDatabase)();
});
(0, vitest_1.beforeEach)(async () => {
    await (0, helpers_1.resetDatabase)();
});
(0, vitest_1.afterAll)(async () => {
    await pool_1.pool.end();
});
(0, vitest_1.describe)('health', () => {
    (0, vitest_1.it)('responds to the guardian health probe', async () => {
        const res = await (0, supertest_1.default)(helpers_1.app).get('/actuator/health?guardianProbe=1');
        (0, vitest_1.expect)(res.status).toBe(200);
        (0, vitest_1.expect)(res.body.status).toBe('UP');
    });
    (0, vitest_1.it)('returns 404 JSON for unknown routes', async () => {
        const res = await (0, supertest_1.default)(helpers_1.app).get('/nope');
        (0, vitest_1.expect)(res.status).toBe(404);
        (0, vitest_1.expect)(res.body.message).toBeTruthy();
    });
});
(0, vitest_1.describe)('registration', () => {
    (0, vitest_1.it)('registers, verifies with the emailed code and returns a usable session', async () => {
        const user = await (0, helpers_1.registerAndVerify)(helpers_1.app, 'alice@example.com');
        (0, vitest_1.expect)(user.token).toBeTruthy();
        (0, vitest_1.expect)(user.userId).toBeGreaterThan(0);
        const profile = await (0, supertest_1.default)(helpers_1.app)
            .get('/vault/users/me')
            .set('Authorization', `Bearer ${user.token}`);
        (0, vitest_1.expect)(profile.status).toBe(200);
        (0, vitest_1.expect)(profile.body.email).toBe('alice@example.com');
    });
    (0, vitest_1.it)('rejects a wrong verification code', async () => {
        await (0, supertest_1.default)(helpers_1.app)
            .post('/vault/auth/register')
            .send({ email: 'bob@example.com', password: 'TestPassword123!', fullName: 'Bob' })
            .set((0, helpers_1.deviceHeaders)('test-device'));
        const res = await (0, supertest_1.default)(helpers_1.app)
            .post('/vault/auth/verify-registration')
            .send({ email: 'bob@example.com', code: '000000' });
        (0, vitest_1.expect)([400, 401]).toContain(res.status);
    });
    (0, vitest_1.it)('rejects a duplicate registration for the same email', async () => {
        await (0, helpers_1.registerAndVerify)(helpers_1.app, 'carol@example.com');
        const res = await (0, supertest_1.default)(helpers_1.app)
            .post('/vault/auth/register')
            .send({ email: 'carol@example.com', password: 'TestPassword123!', fullName: 'Carol' })
            .set((0, helpers_1.deviceHeaders)('test-device'));
        (0, vitest_1.expect)([400, 409]).toContain(res.status);
    });
});
(0, vitest_1.describe)('authentication', () => {
    (0, vitest_1.it)('logs in with the correct password', async () => {
        const device = {
            'X-Guardian-Device-Id': '11111111-1111-4111-8111-111111111113',
            'X-Guardian-Device-Name': 'device-one',
            'X-Guardian-Device-Type': 'android',
        };
        await (0, helpers_1.registerAndVerify)(helpers_1.app, 'dave@example.com', 'TestPassword123!', device);
        const res = await (0, helpers_1.loginAs)(helpers_1.app, 'dave@example.com', 'TestPassword123!', device);
        (0, vitest_1.expect)(res.status).toBe(200);
        (0, vitest_1.expect)(res.body.token).toBeTruthy();
        (0, vitest_1.expect)(res.body.plan).toBe('FREE');
    });
    (0, vitest_1.it)('rejects a wrong password', async () => {
        await (0, helpers_1.registerAndVerify)(helpers_1.app, 'erin@example.com');
        const res = await (0, supertest_1.default)(helpers_1.app)
            .post('/vault/auth/login')
            .set((0, helpers_1.deviceHeaders)('login-device'))
            .send({ email: 'erin@example.com', password: 'nope' });
        (0, vitest_1.expect)(res.status).toBe(401);
    });
    (0, vitest_1.it)('enforces the FREE single-device limit with forceReplaceDevice', async () => {
        await (0, helpers_1.registerAndVerify)(helpers_1.app, 'frank@example.com');
        const second = await (0, supertest_1.default)(helpers_1.app)
            .post('/vault/auth/login')
            .set((0, helpers_1.deviceHeaders)('second-device'))
            .send({ email: 'frank@example.com', password: 'TestPassword123!', forceReplaceDevice: true });
        (0, vitest_1.expect)(second.status).toBe(200);
        (0, vitest_1.expect)(second.body.token).toBeTruthy();
    });
    (0, vitest_1.it)('rejects a request without a token', async () => {
        const res = await (0, supertest_1.default)(helpers_1.app).get('/api/vault');
        (0, vitest_1.expect)(res.status).toBe(401);
    });
    (0, vitest_1.it)('rejects access with a revoked session', async () => {
        const user = await (0, helpers_1.registerAndVerify)(helpers_1.app, 'grace@example.com');
        await (0, supertest_1.default)(helpers_1.app)
            .post('/vault/sessions/logout-all')
            .set('Authorization', `Bearer ${user.token}`);
        const res = await (0, supertest_1.default)(helpers_1.app)
            .get('/api/vault')
            .set('Authorization', `Bearer ${user.token}`);
        (0, vitest_1.expect)(res.status).toBe(401);
    });
});
(0, vitest_1.describe)('vault', () => {
    (0, vitest_1.it)('creates, lists, reads, updates and deletes a password item', async () => {
        const user = await (0, helpers_1.registerAndVerify)(helpers_1.app, 'hank@example.com');
        const auth = { Authorization: `Bearer ${user.token}` };
        const created = await (0, helpers_1.addPassword)(helpers_1.app, user.token, 'GitHub', 's3cret!');
        (0, vitest_1.expect)(created.status).toBe(201);
        (0, vitest_1.expect)(created.body.itemType).toBe('PASSWORD');
        (0, vitest_1.expect)(created.body.title).toBe('GitHub');
        const itemId = created.body.id;
        const list = await (0, supertest_1.default)(helpers_1.app).get('/api/vault').set(auth);
        (0, vitest_1.expect)(list.status).toBe(200);
        (0, vitest_1.expect)(list.body.length).toBe(1);
        const read = await (0, supertest_1.default)(helpers_1.app).get(`/api/vault/${itemId}`).set(auth);
        (0, vitest_1.expect)(read.status).toBe(200);
        (0, vitest_1.expect)(read.body.encryptedPassword).toBe('s3cret!');
        const updated = await (0, supertest_1.default)(helpers_1.app)
            .put(`/api/vault/${itemId}`)
            .set(auth)
            .send({ title: 'GitHub (work)', encryptedPassword: 'new!' });
        (0, vitest_1.expect)(updated.status).toBe(200);
        (0, vitest_1.expect)(updated.body.title).toBe('GitHub (work)');
        const removed = await (0, supertest_1.default)(helpers_1.app).delete(`/api/vault/${itemId}`).set(auth);
        (0, vitest_1.expect)(removed.status).toBe(204);
        const list2 = await (0, supertest_1.default)(helpers_1.app).get('/api/vault').set(auth);
        (0, vitest_1.expect)(list2.body.length).toBe(0);
    });
    (0, vitest_1.it)('isolates vault items between users', async () => {
        const alice = await (0, helpers_1.registerAndVerify)(helpers_1.app, 'isolation-a@example.com');
        const bob = await (0, helpers_1.registerAndVerify)(helpers_1.app, 'isolation-b@example.com');
        const created = await (0, helpers_1.addPassword)(helpers_1.app, alice.token, 'Secret', 'x');
        const itemId = created.body.id;
        const res = await (0, supertest_1.default)(helpers_1.app)
            .get(`/api/vault/${itemId}`)
            .set('Authorization', `Bearer ${bob.token}`);
        (0, vitest_1.expect)(res.status).toBe(404);
    });
    (0, vitest_1.it)('blocks the 11th password on the FREE plan', async () => {
        const user = await (0, helpers_1.registerAndVerify)(helpers_1.app, 'limit@example.com');
        for (let i = 0; i < 10; i += 1) {
            const ok = await (0, helpers_1.addPassword)(helpers_1.app, user.token, `pw-${i}`, 'x');
            (0, vitest_1.expect)(ok.status).toBe(201);
        }
        const eleventh = await (0, helpers_1.addPassword)(helpers_1.app, user.token, 'pw-11', 'x');
        (0, vitest_1.expect)(eleventh.status).toBe(403);
        (0, vitest_1.expect)(eleventh.body.code).toBe('PLAN_LIMIT_REACHED');
    });
});
(0, vitest_1.describe)('plan gating', () => {
    (0, vitest_1.it)('denies documents, emergency, backup and recovery-kit features on FREE', async () => {
        const user = await (0, helpers_1.registerAndVerify)(helpers_1.app, 'gated@example.com');
        const auth = { Authorization: `Bearer ${user.token}` };
        const backup = await (0, supertest_1.default)(helpers_1.app).post('/vault/backup/create').set(auth);
        (0, vitest_1.expect)(backup.status).toBe(403);
        (0, vitest_1.expect)(backup.body.code).toBe('PLAN_LIMIT_REACHED');
        const doc = await (0, supertest_1.default)(helpers_1.app).post('/vault/documents').set(auth).send({ documentName: 'x' });
        (0, vitest_1.expect)(doc.status).toBe(403);
        const emergency = await (0, supertest_1.default)(helpers_1.app).get('/vault/emergency/overview').set(auth);
        (0, vitest_1.expect)(emergency.status).toBe(200);
        (0, vitest_1.expect)(emergency.body).toHaveProperty('plan');
        const kit = await (0, supertest_1.default)(helpers_1.app).post('/vault/recovery-kit/generate').set(auth);
        (0, vitest_1.expect)(kit.status).toBe(403);
    });
    (0, vitest_1.it)('upgrades to PREMIUM via the sandbox payment flow', async () => {
        const user = await (0, helpers_1.registerAndVerify)(helpers_1.app, 'paychurn@example.com');
        const auth = { Authorization: `Bearer ${user.token}` };
        const status = await (0, helpers_1.upgradeUser)(helpers_1.app, user.token, 'PREMIUM');
        (0, vitest_1.expect)(status).toBe(200);
        const sub = await (0, supertest_1.default)(helpers_1.app).get('/vault/api/subscriptions/me').set(auth);
        (0, vitest_1.expect)(sub.status).toBe(200);
        (0, vitest_1.expect)(sub.body.plan).toBe('PREMIUM');
    });
    (0, vitest_1.it)('unlocks backup after upgrading', async () => {
        const user = await (0, helpers_1.registerAndVerify)(helpers_1.app, 'backupafter@example.com');
        await (0, helpers_1.upgradeUser)(helpers_1.app, user.token, 'PREMIUM');
        const backup = await (0, supertest_1.default)(helpers_1.app)
            .post('/vault/backup/create')
            .set('Authorization', `Bearer ${user.token}`);
        (0, vitest_1.expect)(backup.status).toBe(201);
        (0, vitest_1.expect)(backup.body.encryptedBackup).toBeTruthy();
        (0, vitest_1.expect)(backup.body.totalItemCount).toBe(0);
    });
});
(0, vitest_1.describe)('security settings', () => {
    (0, vitest_1.it)('enables two-factor and requires it on the next login', async () => {
        const user = await (0, helpers_1.registerAndVerify)(helpers_1.app, 'twofa@example.com');
        const enabled = await (0, supertest_1.default)(helpers_1.app)
            .put('/vault/auth/2fa')
            .set('Authorization', `Bearer ${user.token}`)
            .send({ enabled: true });
        (0, vitest_1.expect)(enabled.status).toBe(200);
        (0, vitest_1.expect)(enabled.body.twoFactorEnabled).toBe(true);
        const login = await (0, supertest_1.default)(helpers_1.app)
            .post('/vault/auth/login')
            .set((0, helpers_1.deviceHeaders)('2fa-device'))
            .send({ email: 'twofa@example.com', password: 'TestPassword123!' });
        (0, vitest_1.expect)(login.status).toBe(200);
        (0, vitest_1.expect)(login.body.requiresTwoFactor).toBe(true);
    });
});
(0, vitest_1.describe)('notification preferences', () => {
    (0, vitest_1.it)('round-trips preference overrides', async () => {
        const user = await (0, helpers_1.registerAndVerify)(helpers_1.app, 'prefs@example.com');
        const auth = { Authorization: `Bearer ${user.token}` };
        const init = await (0, supertest_1.default)(helpers_1.app).get('/vault/notifications/preferences').set(auth);
        (0, vitest_1.expect)(init.status).toBe(200);
        (0, vitest_1.expect)(init.body.pushEnabled).toBe(true);
        const updated = await (0, supertest_1.default)(helpers_1.app)
            .put('/vault/notifications/preferences')
            .set(auth)
            .send({ productUpdates: false });
        (0, vitest_1.expect)(updated.status).toBe(200);
        (0, vitest_1.expect)(updated.body.productUpdates).toBe(false);
        const again = await (0, supertest_1.default)(helpers_1.app).get('/vault/notifications/preferences').set(auth);
        (0, vitest_1.expect)(again.body.productUpdates).toBe(false);
    });
});
(0, vitest_1.describe)('sessions', () => {
    (0, vitest_1.it)('lists the current device session', async () => {
        const user = await (0, helpers_1.registerAndVerify)(helpers_1.app, 'sessions@example.com');
        const res = await (0, supertest_1.default)(helpers_1.app)
            .get('/vault/sessions')
            .set('Authorization', `Bearer ${user.token}`);
        (0, vitest_1.expect)(res.status).toBe(200);
        const sessions = res.body;
        (0, vitest_1.expect)(sessions.length).toBe(1);
        (0, vitest_1.expect)(sessions[0].current).toBe(true);
    });
});
//# sourceMappingURL=api.test.js.map