import request from 'supertest';
import type { Express } from 'express';

import { createApp } from '../src/app';
import { migrate } from '../src/db/migrate';
import { pool } from '../src/db/pool';
import { getTestCode } from '../src/lib/testCodes';

export const app = createApp();

export interface TestUser {
  email: string;
  password: string;
  token: string;
  userId: number;
}

export async function resetDatabase(): Promise<void> {
  await migrate();
  const res = await pool!.query<{ tablename: string }>(
    `SELECT tablename FROM pg_tables WHERE schemaname = 'public'`
  );
  const tables = res.rows
    .map((r) => r.tablename)
    .filter((t) => t !== 'schema_migrations');
  if (tables.length > 0) {
    await pool!.query(`TRUNCATE TABLE ${tables.map((t) => `"${t}"`).join(', ')} CASCADE`);
  }
}

export function deviceHeaders(name: string) {
  return {
    'X-Guardian-Device-Id': `device-${Math.random().toString(36).slice(2, 10)}`,
    'X-Guardian-Device-Name': name,
    'X-Guardian-Device-Type': 'phone',
  };
}

export async function registerAndVerify(
  server: Express,
  email: string,
  password = 'TestPassword123!',
  device: Record<string, string> = deviceHeaders('test-device'),
): Promise<TestUser> {
  const reg = await request(server)
    .post('/vault/auth/register')
    .send({ email, password, fullname: 'Test User' })
    .set(device);
  if (reg.status !== 201) throw new Error(`register failed: ${reg.status} ${JSON.stringify(reg.body)}`);

  const code = getTestCode(email);
  if (!code) throw new Error(`No test code recorded for ${email}`);

  const verify = await request(server)
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

export async function loginAs(server: Express, email: string, password: string, headers: Record<string, string>) {
  const res = await request(server)
    .post('/vault/auth/login')
    .set(headers)
    .send({ email, password });
  if (res.status !== 200) {
    throw new Error(`login failed: ${res.status} ${JSON.stringify(res.body)}`);
  }
  return res;
}

export async function addPassword(server: Express, token: string, title: string, passwordValue: string) {
  const res = await request(server)
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

export async function upgradeUser(server: Express, token: string, plan: 'PREMIUM' | 'FAMILY'): Promise<number> {
  const init = await request(server)
    .post('/vault/payments/initialize')
    .set('Authorization', `Bearer ${token}`)
    .send({ plan });
  if (init.status !== 201) throw new Error(`payment initialize: ${init.status} ${init.body}`);
  const ref = init.body.reference as string;
  const verify = await request(server)
    .post('/vault/payments/verify')
    .set('Authorization', `Bearer ${token}`)
    .send({ reference: ref });
  return verify.status;
}