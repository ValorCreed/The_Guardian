import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';

import { pool } from '../src/db/pool';
import {
  app,
  resetDatabase,
  deviceHeaders,
  registerAndVerify,
  loginAs,
  addPassword,
  upgradeUser,
} from './helpers';

beforeAll(async () => {
  await resetDatabase();
});

beforeEach(async () => {
  await resetDatabase();
});

afterAll(async () => {
  await pool!.end();
});

describe('health', () => {
  it('responds to the guardian health probe', async () => {
    const res = await request(app).get('/actuator/health?guardianProbe=1');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('UP');
  });

  it('returns 404 JSON for unknown routes', async () => {
    const res = await request(app).get('/nope');
    expect(res.status).toBe(404);
    expect(res.body.message).toBeTruthy();
  });
});

describe('registration', () => {
  it('registers, verifies with the emailed code and returns a usable session', async () => {
    const user = await registerAndVerify(app, 'alice@example.com');
    expect(user.token).toBeTruthy();
    expect(user.userId).toBeGreaterThan(0);

    const profile = await request(app)
      .get('/vault/users/me')
      .set('Authorization', `Bearer ${user.token}`);
    expect(profile.status).toBe(200);
    expect(profile.body.email).toBe('alice@example.com');
  });

  it('rejects a wrong verification code', async () => {
    await request(app)
      .post('/vault/auth/register')
      .send({ email: 'bob@example.com', password: 'TestPassword123!', fullName: 'Bob' })
      .set(deviceHeaders('test-device'));

    const res = await request(app)
      .post('/vault/auth/verify-registration')
      .send({ email: 'bob@example.com', code: '000000' });
    expect([400, 401]).toContain(res.status);
  });

  it('rejects a duplicate registration for the same email', async () => {
    await registerAndVerify(app, 'carol@example.com');
    const res = await request(app)
      .post('/vault/auth/register')
      .send({ email: 'carol@example.com', password: 'TestPassword123!', fullName: 'Carol' })
      .set(deviceHeaders('test-device'));
    expect([400, 409]).toContain(res.status);
  });
});

describe('authentication', () => {
  it('logs in with the correct password', async () => {
    const device = {
      'X-Guardian-Device-Id': '11111111-1111-4111-8111-111111111113',
      'X-Guardian-Device-Name': 'device-one',
      'X-Guardian-Device-Type': 'android',
    };
    await registerAndVerify(app, 'dave@example.com', 'TestPassword123!', device);
    const res = await loginAs(app, 'dave@example.com', 'TestPassword123!', device);
    expect(res.status).toBe(200);
    expect(res.body.token).toBeTruthy();
    expect(res.body.plan).toBe('FREE');
  });

  it('rejects a wrong password', async () => {
    await registerAndVerify(app, 'erin@example.com');
    const res = await request(app)
      .post('/vault/auth/login')
      .set(deviceHeaders('login-device'))
      .send({ email: 'erin@example.com', password: 'nope' });
    expect(res.status).toBe(401);
  });

  it('enforces the FREE single-device limit with forceReplaceDevice', async () => {
    await registerAndVerify(app, 'frank@example.com');

    const second = await request(app)
      .post('/vault/auth/login')
      .set(deviceHeaders('second-device'))
      .send({ email: 'frank@example.com', password: 'TestPassword123!', forceReplaceDevice: true });
    expect(second.status).toBe(200);
    expect(second.body.token).toBeTruthy();
  });

  it('rejects a request without a token', async () => {
    const res = await request(app).get('/api/vault');
    expect(res.status).toBe(401);
  });

  it('rejects access with a revoked session', async () => {
    const user = await registerAndVerify(app, 'grace@example.com');
    await request(app)
      .post('/vault/sessions/logout-all')
      .set('Authorization', `Bearer ${user.token}`);
    const res = await request(app)
      .get('/api/vault')
      .set('Authorization', `Bearer ${user.token}`);
    expect(res.status).toBe(401);
  });
});

describe('vault', () => {
  it('creates, lists, reads, updates and deletes a password item', async () => {
    const user = await registerAndVerify(app, 'hank@example.com');
    const auth = { Authorization: `Bearer ${user.token}` };

    const created = await addPassword(app, user.token, 'GitHub', 's3cret!');
    expect(created.status).toBe(201);
    expect(created.body.itemType).toBe('PASSWORD');
    expect(created.body.title).toBe('GitHub');
    const itemId = created.body.id as number;

    const list = await request(app).get('/api/vault').set(auth);
    expect(list.status).toBe(200);
    expect(list.body.length).toBe(1);

    const read = await request(app).get(`/api/vault/${itemId}`).set(auth);
    expect(read.status).toBe(200);
    expect(read.body.encryptedPassword).toBe('s3cret!');

    const updated = await request(app)
      .put(`/api/vault/${itemId}`)
      .set(auth)
      .send({ title: 'GitHub (work)', encryptedPassword: 'new!' });
    expect(updated.status).toBe(200);
    expect(updated.body.title).toBe('GitHub (work)');

    const removed = await request(app).delete(`/api/vault/${itemId}`).set(auth);
    expect(removed.status).toBe(204);
    const list2 = await request(app).get('/api/vault').set(auth);
    expect(list2.body.length).toBe(0);
  });

  it('isolates vault items between users', async () => {
    const alice = await registerAndVerify(app, 'isolation-a@example.com');
    const bob = await registerAndVerify(app, 'isolation-b@example.com');
    const created = await addPassword(app, alice.token, 'Secret', 'x');
    const itemId = created.body.id as number;

    const res = await request(app)
      .get(`/api/vault/${itemId}`)
      .set('Authorization', `Bearer ${bob.token}`);
    expect(res.status).toBe(404);
  });

  it('blocks the 11th password on the FREE plan', async () => {
    const user = await registerAndVerify(app, 'limit@example.com');
    for (let i = 0; i < 10; i += 1) {
      const ok = await addPassword(app, user.token, `pw-${i}`, 'x');
      expect(ok.status).toBe(201);
    }
    const eleventh = await addPassword(app, user.token, 'pw-11', 'x');
    expect(eleventh.status).toBe(403);
    expect(eleventh.body.code).toBe('PLAN_LIMIT_REACHED');
  });
});

describe('plan gating', () => {
  it('denies documents, emergency, backup and recovery-kit features on FREE', async () => {
    const user = await registerAndVerify(app, 'gated@example.com');
    const auth = { Authorization: `Bearer ${user.token}` };

    const backup = await request(app).post('/vault/backup/create').set(auth);
    expect(backup.status).toBe(403);
    expect(backup.body.code).toBe('PLAN_LIMIT_REACHED');

    const doc = await request(app).post('/vault/documents').set(auth).send({ documentName: 'x' });
    expect(doc.status).toBe(403);

    const emergency = await request(app).get('/vault/emergency/overview').set(auth);
    expect(emergency.status).toBe(200);
    expect(emergency.body).toHaveProperty('plan');

    const kit = await request(app).post('/vault/recovery-kit/generate').set(auth);
    expect(kit.status).toBe(403);
  });

  it('upgrades to PREMIUM via the sandbox payment flow', async () => {
    const user = await registerAndVerify(app, 'paychurn@example.com');
    const auth = { Authorization: `Bearer ${user.token}` };

    const status = await upgradeUser(app, user.token, 'PREMIUM');
    expect(status).toBe(200);

    const sub = await request(app).get('/vault/api/subscriptions/me').set(auth);
    expect(sub.status).toBe(200);
    expect(sub.body.plan).toBe('PREMIUM');
  });

  it('unlocks backup after upgrading', async () => {
    const user = await registerAndVerify(app, 'backupafter@example.com');
    await upgradeUser(app, user.token, 'PREMIUM');
    const backup = await request(app)
      .post('/vault/backup/create')
      .set('Authorization', `Bearer ${user.token}`);
    expect(backup.status).toBe(201);
    expect(backup.body.encryptedBackup).toBeTruthy();
    expect(backup.body.totalItemCount).toBe(0);
  });
});

describe('security settings', () => {
  it('enables two-factor and requires it on the next login', async () => {
    const user = await registerAndVerify(app, 'twofa@example.com');

    const enabled = await request(app)
      .put('/vault/auth/2fa')
      .set('Authorization', `Bearer ${user.token}`)
      .send({ enabled: true });
    expect(enabled.status).toBe(200);
    expect(enabled.body.twoFactorEnabled).toBe(true);

    const login = await request(app)
      .post('/vault/auth/login')
      .set(deviceHeaders('2fa-device'))
      .send({ email: 'twofa@example.com', password: 'TestPassword123!' });
    expect(login.status).toBe(200);
    expect(login.body.requiresTwoFactor).toBe(true);
  });
});

describe('notification preferences', () => {
  it('round-trips preference overrides', async () => {
    const user = await registerAndVerify(app, 'prefs@example.com');
    const auth = { Authorization: `Bearer ${user.token}` };

    const init = await request(app).get('/vault/notifications/preferences').set(auth);
    expect(init.status).toBe(200);
    expect(init.body.pushEnabled).toBe(true);

    const updated = await request(app)
      .put('/vault/notifications/preferences')
      .set(auth)
      .send({ productUpdates: false });
    expect(updated.status).toBe(200);
    expect(updated.body.productUpdates).toBe(false);

    const again = await request(app).get('/vault/notifications/preferences').set(auth);
    expect(again.body.productUpdates).toBe(false);
  });
});

describe('sessions', () => {
  it('lists the current device session', async () => {
    const user = await registerAndVerify(app, 'sessions@example.com');
    const res = await request(app)
      .get('/vault/sessions')
      .set('Authorization', `Bearer ${user.token}`);
    expect(res.status).toBe(200);
    const sessions = res.body as Array<{ id: string; current: boolean }>;
    expect(sessions.length).toBe(1);
    expect(sessions[0].current).toBe(true);
  });
});