/*
 * Live HTTP contract test.
 *
 * Drives the running backend exactly like the Android app does
 * (src/services/api.ts) and asserts that every response matches the shapes
 * the app reads. Run against the locally running server (test mode):
 *
 *   node tests/live-contract.mjs
 *
 * Exit code 0 when every check passes.
 */
import assert from 'node:assert/strict';

const BASE = process.env.GUARDIAN_BASE_URL || 'http://localhost:4000';

const results = [];
const entries = [];
let failures = 0;

function check(name, fn) {
  entries.push({ name, fn });
}

async function runAll() {
  for (const entry of entries) {
    try {
      const detail = await entry.fn();
      results.push({ name: entry.name, ok: true, detail: detail ?? '' });
      console.log(`  PASS  ${entry.name}`);
    } catch (err) {
      failures += 1;
      results.push({ name: entry.name, ok: false, detail: err.message });
      console.error(`  FAIL  ${entry.name}\n        ${String(err.message).replace(/\n/g, '\n        ')}`);
    }
  }

  console.log('');
  console.log(`${results.filter((r) => r.ok).length}/${results.length} contract checks passed.`);
  if (failures > 0) {
    console.log(`${failures} contract checks FAILED.`);
    process.exit(1);
  }
}

const DEV_A = '11111111-1111-4111-8111-111111111111';
const DEV_B = '22222222-2222-4222-8222-222222222222';
const DEV_C = '33333333-3333-4333-8333-333333333333';
const DEVICE_ID_MAP = { alice: DEV_A, bob: DEV_B, carol: DEV_C };

async function req(path, { method = 'GET', token, json, headers = {}, form, expect } = {}) {
  const h = {
    ...headers,
    'X-Guardian-Device-Id': headers['X-Guardian-Device-Id'] || DEV_A,
    'X-Guardian-Device-Name': headers['X-Guardian-Device-Name'] || 'Contract Test Device',
    'X-Guardian-Device-Type': headers['X-Guardian-Device-Type'] || 'android',
  };
  let body;
  if (form) {
    body = form;
  } else if (json !== undefined) {
    h['Content-Type'] = 'application/json';
    body = JSON.stringify(json);
  }
  if (token) h.Authorization = `Bearer ${token}`;

  const res = await fetch(`${BASE}${path}`, { method, headers: h, body });
  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  if (expect && res.status !== expect) {
    throw new Error(`HTTP ${res.status} (expected ${expect}) for ${method} ${path}: ${JSON.stringify(data)}`);
  }
  return { status: res.status, data };
}

function has(obj, key) {
  assert.ok(obj && typeof obj === 'object', `response is not an object: ${JSON.stringify(obj)}`);
  assert.ok(key in obj, `missing field "${key}" in ${JSON.stringify(obj)}`);
}

const stamp = Date.now().toString(36);
const makeEmail = (name) => `${name}-${stamp}@guardian.test`;

/* ------------------------------------------------------------------ */
/* Users                                                               */
/* ------------------------------------------------------------------ */

const aliceEmail = makeEmail('alice');
const bobEmail = makeEmail('bob');
const carolEmail = makeEmail('carol');
const alicePassword = 'CorrectHorse42!';
const bobPassword = 'BatteryStaple73!';
const carolPassword = 'Tr0ub4dor&3X';

async function harnessCode(email) {
  const r = await req(`/vault/auth/_test/codes/${encodeURIComponent(email)}`);
  return r.data.code;
}

async function registerAndVerify(email, fullName, password) {
  const reg = await req('/vault/auth/register', {
    method: 'POST',
    json: { fullname: fullName, email, password },
    expect: 201,
  });
  has(reg.data, 'email');
  has(reg.data, 'message');
  assert.ok(typeof reg.data.verificationEmailSent === 'boolean', 'verificationEmailSent boolean');

  const code = await harnessCode(email);
  assert.ok(/^\d{6}$/.test(String(code ?? '')), `registration code is 6 digits (got ${JSON.stringify(code)})`);
  const verified = await req('/vault/auth/verify-registration', {
    method: 'POST',
    json: { email, code },
    expect: 200,
  });
  has(verified.data, 'token');
  has(verified.data, 'email');
  return verified.data.token;
}

async function login(email, password) {
  const r = await req('/vault/auth/login', { method: 'POST', json: { email, password }, expect: 200 });
  has(r.data, 'token');
  return r.data.token;
}

const tokens = {};

check('A1 register alice', async () => {
  tokens.alice = await registerAndVerify(aliceEmail, 'Alice Trust', alicePassword);
  assert.ok(tokens.alice.length > 10, 'token present');
});

check('A2 register bob', async () => {
  tokens.bob = await registerAndVerify(bobEmail, 'Bob Helper', bobPassword);
});

check('A3 register carol (FREE)', async () => {
  tokens.carol = await registerAndVerify(carolEmail, 'Carol Free', carolPassword);
});

check('A4 login works after registration', async () => {
  const t = await login(aliceEmail, alicePassword);
  assert.ok(t.length > 10);
  tokens.alice = t;
});

check('A5 wrong password rejected', async () => {
  const r = await req('/vault/auth/login', { method: 'POST', json: { email: aliceEmail, password: 'wrong!' }, expect: 401 });
  assert.ok(r.data);
});

check('A6 wrong verification code rejected', async () => {
  const r = await req('/vault/auth/verify-registration', {
    method: 'POST',
    json: { email: bobEmail, code: '000000' },
  });
  assert.ok(r.status >= 400, 'bad code returns 4xx');
});

/* ------------------------------------------------------------------ */
/* Account basics                                                      */
/* ------------------------------------------------------------------ */

check('B1 legal consent fetch', async () => {
  const r = await req('/vault/auth/legal-consent?version=2024-05-01', { token: tokens.alice, expect: 200 });
  has(r.data, 'version');
  has(r.data, 'privacyAccepted');
  has(r.data, 'termsAccepted');
});

check('B2 legal consent save', async () => {
  const r = await req('/vault/auth/legal-consent', {
    method: 'POST',
    token: tokens.alice,
    json: { version: '2024-05-01', privacyAccepted: true, termsAccepted: true, clientSource: 'MOBILE_APP' },
    expect: 200,
  });
  assert.equal(r.data.privacyAccepted, true, 'privacy accepted');
});

check('B3 profile /vault/users/me', async () => {
  const r = await req('/vault/users/me', { token: tokens.alice, expect: 200 });
  has(r.data, 'email');
  has(r.data, 'fullName');
});

check('B4 profile update /vault/users/me/profile', async () => {
  const r = await req('/vault/users/me/profile', {
    method: 'PUT',
    token: tokens.alice,
    json: { fullName: 'Alice Trustworthy' },
    expect: 200,
  });
  assert.equal(String(r.data.fullName || r.data.name || r.data.fullname), 'Alice Trustworthy');
});

check('B5 notifications list + unread-count', async () => {
  const list = await req('/vault/notifications', { token: tokens.alice, expect: 200 });
  assert.ok(Array.isArray(list.data), 'notifications array');
  const unread = await req('/vault/notifications/unread-count', { token: tokens.alice, expect: 200 });
  assert.ok('count' in unread.data || 'unreadCount' in unread.data || typeof unread.data === 'number', 'unread count shape');
});

check('B6 sessions list + heartbeat', async () => {
  const s = await req('/vault/sessions', { token: tokens.alice, expect: 200 });
  assert.ok(Array.isArray(s.data), 'sessions array');
  const hb = await req('/vault/sessions/heartbeat', { method: 'GET', token: tokens.alice, expect: 200 });
  has(hb.data, 'active');
});

/* ------------------------------------------------------------------ */
/* Subscriptions and payments                                          */
/* ------------------------------------------------------------------ */

check('C1 subscription starts FREE', async () => {
  const r = await req('/vault/api/subscriptions/me', { token: tokens.alice, expect: 200 });
  assert.equal(r.data.plan, 'FREE');
});

check('C2 upgrade FREE -> FAMILY (sandbox)', async () => {
  const premium = await req('/vault/api/subscriptions/upgrade?plan=PREMIUM', { method: 'POST', token: tokens.alice, expect: 200 });
  assert.ok(['PREMIUM', 'FAMILY'].includes(premium.data.plan), `plan is ${premium.data.plan}`);
  const family = await req('/vault/api/subscriptions/upgrade?plan=FAMILY', { method: 'POST', token: tokens.alice, expect: 200 });
  assert.equal(family.data.plan, 'FAMILY');
});

check('C3 payment initialize + verify (sandbox)', async () => {
  const init = await req('/vault/payments/initialize', { method: 'POST', token: tokens.alice, json: { plan: 'FAMILY' }, expect: 201 });
  has(init.data, 'authorizationUrl');
  has(init.data, 'accessCode');
  has(init.data, 'reference');
  const verify = await req('/vault/payments/verify', { method: 'POST', token: tokens.alice, json: { reference: init.data.reference }, expect: 200 });
  assert.ok(verify.data);
});

/* ------------------------------------------------------------------ */
/* Vault items: passwords, cards, notes, documents                     */
/* ------------------------------------------------------------------ */

let passwordId;
let cardId;
let noteId;
let documentId;

check('D1 create password vault item', async () => {
  const r = await req('/api/vault', {
    method: 'POST',
    token: tokens.alice,
    json: { itemType: 'PASSWORD', title: 'Example Login', usernameValue: 'alice@example.com', encryptedPassword: 'SGVsbG8=', website: 'https://example.com', notes: 'k8 pass' },
    expect: 201,
  });
  has(r.data, 'id');
  assert.equal(r.data.itemType || 'PASSWORD', 'PASSWORD');
  passwordId = Number(r.data.id);
});

check('D2 list vault items', async () => {
  const r = await req('/api/vault', { token: tokens.alice, expect: 200 });
  assert.ok(Array.isArray(r.data), 'list array');
  assert.ok(r.data.some((i) => Number(i.id) === passwordId), 'new password present');
});

check('D3 get vault item', async () => {
  const r = await req(`/api/vault/${passwordId}`, { token: tokens.alice, expect: 200 });
  has(r.data, 'id');
  assert.equal(Number(r.data.id), passwordId);
});

check('D4 update vault item', async () => {
  const r = await req(`/api/vault/${passwordId}`, {
    method: 'PUT',
    token: tokens.alice,
    json: { itemType: 'PASSWORD', title: 'Example Login (updated)', usernameValue: 'alice@example.com', encryptedPassword: 'SGVsbG8=', website: 'https://example.com', notes: 'rotated' },
    expect: 200,
  });
  has(r.data, 'id');
});

check('D5 create card', async () => {
  const r = await req('/vault/cards', {
    method: 'POST',
    token: tokens.alice,
    json: { cardName: 'Visa Travel', encryptedCardNumber: '4111111111111111', encryptedExpiryDate: '12/28', encryptedCvv: '123', encryptedCardholderName: 'Alice Trust', encryptedNotes: 'primary' },
    expect: 201,
  });
  has(r.data, 'id');
  has(r.data, 'cardName');
  has(r.data, 'encryptedCardNumber');
  cardId = Number(r.data.id);
});

check('D6 list cards', async () => {
  const r = await req('/vault/cards', { token: tokens.alice, expect: 200 });
  assert.ok(Array.isArray(r.data), 'cards array');
  assert.ok(r.data.some((c) => Number(c.id) === cardId), 'new card present');
  const found = r.data.find((c) => Number(c.id) === cardId);
  assert.equal(found.cardName, 'Visa Travel');
  assert.ok(found.encryptedCardNumber.length > 0, 'card number decrypted blob present');
});

check('D7 create note', async () => {
  const r = await req('/vault/notes', {
    method: 'POST',
    token: tokens.alice,
    json: { title: 'Safe Deposit Box', category: 'Other', encryptedContent: 'Y2xvc2V0IG51bWJlciAyNDQ= ', pinned: false },
    expect: 201,
  });
  has(r.data, 'id');
  has(r.data, 'title');
  noteId = Number(r.data.id);
});

check('D8 notes list returns created note', async () => {
  const r = await req('/vault/notes', { token: tokens.alice, expect: 200 });
  assert.ok(Array.isArray(r.data), 'notes array');
  assert.ok(r.data.some((n) => Number(n.id) === noteId), 'note present');
});

check('D9 upload document (multipart)', async () => {
  const form = new FormData();
  form.append('file', new Blob([Buffer.from('guardian-contract-document-contents')], { type: 'text/plain' }), 'will.txt');
  form.append('documentName', 'Last Will');
  form.append('documentType', 'text/plain');
  form.append('sizeBytes', '34');
  const r = await req('/vault/documents/upload', { method: 'POST', token: tokens.alice, form, expect: 201 });
  has(r.data, 'id');
  documentId = Number(r.data.id);
});

check('D10 documents list + download', async () => {
  const list = await req('/vault/documents', { token: tokens.alice, expect: 200 });
  assert.ok(Array.isArray(list.data), 'documents array');
  assert.ok(list.data.some((d) => Number(d.id) === documentId), 'document present');

  const dl = await req(`/vault/documents/${documentId}/download`, { token: tokens.alice });
  assert.ok(dl.status === 200, `download 200 (got ${dl.status})`);
});

check('D11 update + delete vault item, note, card', async () => {
  const upNote = await req(`/vault/notes/${noteId}`, { method: 'PUT', token: tokens.alice, json: { title: 'Safe Deposit Box 2', category: 'Identity', encryptedContent: 'Y2xvc2V0' }, expect: 200 });
  has(upNote.data, 'id');

  const cardDetail = await req(`/vault/cards/${cardId}`, { token: tokens.alice, expect: 200 });
  has(cardDetail.data, 'cardName');

  await req(`/vault/notes/${noteId}`, { method: 'DELETE', token: tokens.alice, expect: 204 });
  await req(`/vault/cards/${cardId}`, { method: 'DELETE', token: tokens.alice, expect: 204 });
});

check('D12 vault item delete', async () => {
  await req(`/api/vault/${passwordId}`, { method: 'DELETE', token: tokens.alice, expect: 204 });
});

/* ------------------------------------------------------------------ */
/* Backup                                                              */
/* ------------------------------------------------------------------ */

let encryptedBackup;

check('E1 backup status', async () => {
  const r = await req('/vault/backup/status', { token: tokens.alice, expect: 200 });
  assert.equal(r.data.allowed, true, 'backup allowed on FAMILY');
  has(r.data, 'totalItemCount');
});

check('E2 create backup', async () => {
  const r = await req('/vault/backup/create', { method: 'POST', token: tokens.alice, expect: 201 });
  has(r.data, 'encryptedBackup');
  has(r.data, 'checksum');
  encryptedBackup = r.data.encryptedBackup;
});

check('E3 restore backup is rejected with fake payload', async () => {
  const r = await req('/vault/backup/restore', {
    method: 'POST',
    token: tokens.alice,
    json: { encryptedBackup: 'not-a-real-backup', replaceExisting: true },
  });
  assert.ok(r.status >= 400, 'invalid backup rejected');
});

/* ------------------------------------------------------------------ */
/* Emergency access                                                    */
/* ------------------------------------------------------------------ */

let aliceContactId;
let emergencyRequestId;

check('F1 emergency contacts CRUD', async () => {
  const created = await req('/vault/emergency/contacts', {
    method: 'POST',
    token: tokens.alice,
    json: {
      contactEmail: bobEmail,
      contactName: 'Bob Helper',
      relationship: 'Spouse',
      waitingPeriodHours: 1,
      allowPasswords: true,
      allowCards: true,
      allowDocuments: true,
      allowNotes: true,
      encryptedEmergencyNote: 'bnV0ZQ==',
      active: true,
    },
    expect: 201,
  });
  has(created.data, 'id');
  has(created.data, 'contactEmail');
  has(created.data, 'waitingPeriodHours');
  has(created.data, 'allowPasswords');
  has(created.data, 'active');
  assert.equal(created.data.contactEmail, bobEmail);
  aliceContactId = Number(created.data.id);

  const list = await req('/vault/emergency/contacts', { token: tokens.alice, expect: 200 });
  assert.ok(list.data.some((c) => Number(c.id) === aliceContactId), 'contact in list');

  const updated = await req(`/vault/emergency/contacts/${aliceContactId}`, {
    method: 'PUT',
    token: tokens.alice,
    json: {
      contactEmail: bobEmail,
      contactName: 'Bob Helper',
      relationship: 'Spouse',
      waitingPeriodHours: 2,
      allowPasswords: true,
      allowCards: false,
      allowDocuments: true,
      allowNotes: true,
      encryptedEmergencyNote: 'bnV0ZQ==',
      active: true,
    },
    expect: 200,
  });
  assert.equal(updated.data.waitingPeriodHours, 2);
  assert.equal(updated.data.allowCards, false);
});

check('F2 emergency overview', async () => {
  const r = await req('/vault/emergency/overview', { token: tokens.alice, expect: 200 });
  has(r.data, 'plan');
  has(r.data, 'premiumOrFamily');
  has(r.data, 'contactLimit');
  has(r.data, 'contactCount');
  has(r.data, 'contacts');
  has(r.data, 'receivedRequests');
  has(r.data, 'sentRequests');
  has(r.data, 'auditLogs');
  assert.equal(r.data.plan, 'FAMILY');
  assert.equal(r.data.contactCount, 1);
});

check('F3 bob requests emergency access to alice', async () => {
  await req('/vault/api/subscriptions/upgrade?plan=PREMIUM', { method: 'POST', token: tokens.bob, expect: 200 });
  const r = await req('/vault/emergency/requests', {
    method: 'POST',
    token: tokens.bob,
    json: { ownerEmail: aliceEmail, message: 'I need access' },
    expect: 201,
  });
  has(r.data, 'id');
  has(r.data, 'contactId');
  has(r.data, 'ownerEmail');
  has(r.data, 'requesterEmail');
  has(r.data, 'status');
  has(r.data, 'passwordsAllowed');
  has(r.data, 'cardsAllowed');
  has(r.data, 'documentsAllowed');
  has(r.data, 'notesAllowed');
  assert.equal(r.data.status, 'PENDING');
  emergencyRequestId = Number(r.data.id);
});

check('F4 alice approves emergency request', async () => {
  const r = await req(`/vault/emergency/requests/${emergencyRequestId}/approve`, { method: 'POST', token: tokens.alice, expect: 200 });
  assert.equal(r.data.status, 'APPROVED');
});

check('F5 bob reads emergency vault items', async () => {
  const r = await req(`/vault/emergency/requests/${emergencyRequestId}/vault`, { token: tokens.bob, expect: 200 });
  has(r.data, 'requestId');
  has(r.data, 'ownerName');
  has(r.data, 'ownerEmail');
  has(r.data, 'passwordsAllowed');
  has(r.data, 'cardsAllowed');
  has(r.data, 'documentsAllowed');
  has(r.data, 'notesAllowed');
  has(r.data, 'passwords');
  has(r.data, 'cards');
  has(r.data, 'documents');
  has(r.data, 'notes');
  assert.equal(r.data.ownerEmail, aliceEmail);
});

check('F6 emergency audit trail', async () => {
  const r = await req('/vault/emergency/audit', { token: tokens.alice, expect: 200 });
  assert.ok(Array.isArray(r.data), 'audit array');
  assert.ok(r.data.some((a) => a.actorEmail === bobEmail), 'requested event recorded');
});

/* ------------------------------------------------------------------ */
/* Family sharing                                                      */
/* ------------------------------------------------------------------ */

async function ensureVaultItem() {
  const list = await req('/api/vault', { token: tokens.alice, expect: 200 });
  if (list.data.length > 0) return Number(list.data[0].id);
  const created = await req('/api/vault', {
    method: 'POST',
    token: tokens.alice,
    json: { itemType: 'PASSWORD', title: 'Shared Family Login', usernameValue: 'family@example.com', encryptedPassword: 'ZmFtaWx5', website: 'https://example.com' },
    expect: 201,
  });
  return Number(created.data.id);
}

let familyMembershipId;

check('G1 family overview', async () => {
  const r = await req('/vault/family', { token: tokens.alice, expect: 200 });
  has(r.data, 'familyPlan');
  has(r.data, 'memberLimit');
  has(r.data, 'members');
  assert.equal(r.data.familyPlan, true);
});

check('G2 add family member bob', async () => {
  const sharedPasswordId = await ensureVaultItem();
  const r = await req('/vault/family/members', {
    method: 'POST',
    token: tokens.alice,
    json: {
      email: bobEmail.trim().toLowerCase(),
      sharePasswords: true,
      shareCards: false,
      shareDocuments: false,
      shareNotes: true,
      passwordItemIds: [sharedPasswordId],
      cardItemIds: [],
      documentItemIds: [],
      noteItemIds: [],
    },
    expect: 201,
  });
  has(r.data, 'membershipId');
  has(r.data, 'email');
  familyMembershipId = Number(r.data.membershipId);
});

check('G3 bob sees shared items', async () => {
  const items = await req('/vault/family/shared-items', { token: tokens.bob, expect: 200 });
  assert.ok(Array.isArray(items.data.passwords) || Array.isArray(items.data), 'shared response holds lists');
  const passwords = Array.isArray(items.data.passwords) ? items.data.passwords : items.data;
  assert.ok(passwords.length > 0, 'at least one shared password');
  const detail = await req('/vault/family/shared-passwords', { token: tokens.bob, expect: 200 });
  assert.ok(Array.isArray(detail.data) && detail.data.length > 0, 'shared-passwords populated');
});

check('G4 family member access read + update', async () => {
  const access = await req(`/vault/family/members/${familyMembershipId}/access`, { token: tokens.alice, expect: 200 });
  has(access.data, 'passwordItemIds');
  has(access.data, 'email');
  const updated = await req(`/vault/family/members/${familyMembershipId}/access`, {
    method: 'PUT',
    token: tokens.alice,
    json: { sharePasswords: true, shareCards: false, shareDocuments: false, shareNotes: true, passwordItemIds: [], cardItemIds: [], documentItemIds: [], noteItemIds: [] },
    expect: 200,
  });
  has(updated.data, 'passwordItemIds');
});

check('G5 member password risks populated', async () => {
  const r = await req('/vault/family/member-password-risks', { token: tokens.bob, expect: 200 });
  assert.ok(Array.isArray(r.data), 'risks array');
});

/* ------------------------------------------------------------------ */
/* Recovery circle                                                     */
/* ------------------------------------------------------------------ */

let recoveryCode;
let recoveryRequestId;

check('H1 recovery circle overview has real member userIds', async () => {
  const r = await req('/vault/recovery-circle', { token: tokens.alice, expect: 200 });
  has(r.data, 'eligible');
  has(r.data, 'enabled');
  has(r.data, 'members');
  has(r.data, 'candidates');
  assert.equal(r.data.plan, 'FAMILY');
  const bobCandidate = r.data.candidates.find((c) => c.email === bobEmail);
  assert.ok(bobCandidate, 'bob candidate present');
  assert.notEqual(bobCandidate.userId, bobCandidate.contactId, 'userId is a real user id, not the contact id');
});

check('H2 configure recovery circle returns recovery code', async () => {
  const overview = await req('/vault/recovery-circle', { token: tokens.alice, expect: 200 });
  const bobCandidate = overview.data.candidates.find((c) => c.email === bobEmail);
  assert.ok(bobCandidate, 'bob candidate');

  const r = await req('/vault/recovery-circle', {
    method: 'PUT',
    token: tokens.alice,
    json: { enabled: true, threshold: 1, memberUserIds: [Number(bobCandidate.userId)], password: alicePassword },
    expect: 200,
  });
  assert.equal(r.data.enabled, true);
  assert.ok(typeof r.data.recoveryCode === 'string' && r.data.recoveryCode.length > 0, 'plaintext recovery code returned');
  recoveryCode = r.data.recoveryCode;
});

check('H3 start recovery with malformed code is rejected', async () => {
  const r = await req('/vault/recovery-circle/recovery/start', {
    method: 'POST',
    json: { email: aliceEmail, recoveryCode: 'BADCODE123' },
  });
  assert.ok(r.status >= 400, 'bad code rejected');
});

check('H4 start + status + complete recovery', async () => {
  const started = await req('/vault/recovery-circle/recovery/start', {
    method: 'POST',
    json: { email: aliceEmail, recoveryCode },
    expect: 201,
  });
  has(started.data, 'requestId');
  recoveryRequestId = started.data.requestId;

  const status = await req('/vault/recovery-circle/recovery/status', {
    method: 'POST',
    json: { requestId: recoveryRequestId, recoveryCode },
    expect: 200,
  });
  has(status.data, 'status');
  has(status.data, 'approvalCount');
  has(status.data, 'threshold');
  has(status.data, 'canComplete');

  const approve = await req(`/vault/recovery-circle/requests/${recoveryRequestId}/approve`, { method: 'POST', token: tokens.bob, expect: 200 });
  has(approve.data, 'requestId');
  has(approve.data, 'canVote');
  has(approve.data, 'status');

  const completed = await req('/vault/recovery-circle/recovery/complete', {
    method: 'POST',
    json: { requestId: recoveryRequestId, recoveryCode, newPassword: 'BrandNewPass!99' },
    expect: 200,
  });
  has(completed.data, 'message');
});

check('H5 owner can log in with reset password', async () => {
  const t = await login(aliceEmail, 'BrandNewPass!99');
  assert.ok(t.length > 10);
  tokens.alice = t;
});

/* ------------------------------------------------------------------ */
/* Duress mode + biometrics                                            */
/* ------------------------------------------------------------------ */

let duressContactUserId;

check('I1 duress settings', async () => {
  const r = await req('/vault/auth/duress', { token: tokens.alice, expect: 200 });
  has(r.data, 'plan');
  has(r.data, 'eligible');
  has(r.data, 'enabled');
  has(r.data, 'contacts');
  assert.ok(Array.isArray(r.data.contacts), 'contacts array');
  if (r.data.contacts.length > 0) duressContactUserId = Number(r.data.contacts[0].userId);
});

check('I2 configure duress', async () => {
  if (!duressContactUserId) {
    await req('/vault/emergency/contacts', {
      method: 'POST',
      token: tokens.alice,
      json: { contactEmail: bobEmail.trim().toLowerCase(), contactName: 'Bob', relationship: 'Friend', waitingPeriodHours: 72 },
      expect: 201,
    });
    const duress = await req('/vault/auth/duress', { token: tokens.alice, expect: 200 });
    if (duress.data.contacts.length > 0) duressContactUserId = Number(duress.data.contacts[0].userId);
  }
  const r = await req('/vault/auth/duress', {
    method: 'PUT',
    token: tokens.alice,
    json: {
      currentPassword: 'BrandNewPass!99',
      duressPassword: 'DuressPass!22',
      alertEnabled: true,
      alertContactUserId: duressContactUserId ?? null,
      alertDelayMinutes: 60,
    },
    expect: 200,
  });
  has(r.data, 'enabled');
  has(r.data, 'alertDelayMinutes');
});

check('I3 duress preview returns DURESS session', async () => {
  const r = await req('/vault/auth/duress/preview', {
    method: 'POST',
    token: tokens.alice,
    json: { currentPassword: 'DuressPass!22' },
    expect: 200,
  });
  assert.equal(r.data.sessionMode, 'DURESS');
});

check('I4 biometric enroll + login + revoke', async () => {
  const enroll = await req('/vault/auth/biometric/enroll', { method: 'POST', token: tokens.alice, expect: 201 });
  has(enroll.data, 'credentialToken');
  const credentialToken = enroll.data.credentialToken;

  const bioLogin = await req('/vault/auth/biometric/login', {
    method: 'POST',
    json: { email: aliceEmail, credentialToken },
    expect: 200,
  });
  has(bioLogin.data, 'token');

  await req('/vault/auth/biometric', { method: 'DELETE', token: tokens.alice, expect: 200 });
});

/* ------------------------------------------------------------------ */
/* Guardian safety check                                               */
/* ------------------------------------------------------------------ */

check('J1 safety-check default (unconfigured)', async () => {
  const r = await req('/vault/safety-check', { token: tokens.bob, expect: 200 });
  has(r.data, 'eligible');
  has(r.data, 'enabled');
  has(r.data, 'status');
  has(r.data, 'contacts');
});

check('J2 configure safety-check via PUT', async () => {
  const overview = await req('/vault/safety-check', { token: tokens.alice, expect: 200 });
  const contact = overview.data.contacts.find((c) => c.email === bobEmail) || overview.data.contacts[0];
  assert.ok(contact, 'has a contact to assign');

  const r = await req('/vault/safety-check', {
    method: 'PUT',
    token: tokens.alice,
    json: { enabled: true, contactId: Number(contact.id), intervalDays: 7, gracePeriodHours: 24 },
    expect: 200,
  });
  has(r.data, 'enabled');
  has(r.data, 'contactId');
  assert.equal(r.data.enabled, true);
});

check('J3 check-in returns full response', async () => {
  const r = await req('/vault/safety-check/check-in', { method: 'POST', token: tokens.alice, expect: 200 });
  has(r.data, 'enabled');
  has(r.data, 'status');
  has(r.data, 'lastCheckInAt');
  has(r.data, 'nextCheckInAt');
});

/* ------------------------------------------------------------------ */
/* Incident lockdown                                                   */
/* ------------------------------------------------------------------ */

let incidentId;

check('K1 incident overview (no active incident)', async () => {
  const r = await req('/vault/auth/incidents', { token: tokens.alice, expect: 200 });
  has(r.data, 'plan');
  has(r.data, 'eligible');
  has(r.data, 'canStart');
  has(r.data, 'message');
  has(r.data, 'activeIncident');
  has(r.data, 'history');
  assert.equal(r.data.plan, 'FAMILY');
});

check('K2 start incident lockdown', async () => {
  const r = await req('/vault/auth/incidents/start', {
    method: 'POST',
    token: tokens.alice,
    json: { type: 'LOST_OR_STOLEN_DEVICE', currentPassword: 'BrandNewPass!99', note: 'phone left on a bus' },
    expect: 201,
  });
  has(r.data, 'publicId');
  has(r.data, 'type');
  has(r.data, 'status');
  has(r.data, 'planSnapshot');
  has(r.data, 'safeDeviceName');
  has(r.data, 'progress');
  has(r.data, 'sessionsRevoked');
  has(r.data, 'biometricsRevoked');
  has(r.data, 'startedAt');
  has(r.data, 'canComplete');
  has(r.data, 'canCancel');
  has(r.data, 'tasks');
  has(r.data, 'timeline');
  assert.equal(r.data.status, 'ACTIVE');
  assert.ok(Array.isArray(r.data.tasks) && r.data.tasks.length >= 4, 'recovery tasks present');
  assert.ok(Array.isArray(r.data.timeline) && r.data.timeline.length >= 2, 'timeline events present');
  const rotate = r.data.tasks.find((t) => t.code === 'ROTATE_MASTER_PASSWORD');
  assert.ok(rotate, 'rotate task exists');
  incidentId = Number(r.data.id);
});

check('K3 rotate master password during incident', async () => {
  const r = await req(`/vault/auth/incidents/${incidentId}/rotate-password`, {
    method: 'POST',
    token: tokens.alice,
    json: { currentPassword: 'BrandNewPass!99', newPassword: 'RotatedIncid!42' },
    expect: 200,
  });
  has(r.data, 'status');
  assert.equal(r.data.status, 'ACTIVE');
  const rotate = r.data.tasks.find((t) => t.code === 'ROTATE_MASTER_PASSWORD');
  assert.equal(rotate.status, 'COMPLETED');
});

check('K4 update a recovery task', async () => {
  const active = await req('/vault/auth/incidents', { token: tokens.alice, expect: 200 });
  const task = active.data.activeIncident.tasks.find((t) => t.code === 'VERIFY_RECOVERY_PATHS');
  assert.ok(task, 'optional task present');
  const r = await req(`/vault/auth/incidents/${incidentId}/tasks/${task.id}`, {
    method: 'PATCH',
    token: tokens.alice,
    json: { status: 'COMPLETED' },
    expect: 200,
  });
  const updated = r.data.tasks.find((t) => t.id === task.id);
  assert.equal(updated.status, 'COMPLETED');
  has(r.data, 'completedAt');
});

check('K5 incidents cannot be cancelled after password rotation', async () => {
  const r = await req(`/vault/auth/incidents/${incidentId}/cancel`, {
    method: 'POST',
    token: tokens.alice,
    json: { currentPassword: 'RotatedIncid!42' },
  });
  assert.ok(r.status >= 400, `cancel blocked after rotation (got ${r.status})`);
});

check('K6 complete incident lockdown', async () => {
  const active = await req('/vault/auth/incidents', { token: tokens.alice, expect: 200 });
  const tasks = active.data.activeIncident.tasks;
  for (const t of tasks) {
    if (t.status !== 'COMPLETED') {
      await req(`/vault/auth/incidents/${incidentId}/tasks/${t.id}`, {
        method: 'PATCH',
        token: tokens.alice,
        json: { status: 'COMPLETED' },
        expect: 200,
      });
    }
  }
  const r = await req(`/vault/auth/incidents/${incidentId}/complete`, { method: 'POST', token: tokens.alice, expect: 200 });
  assert.equal(r.data.status, 'COMPLETED');
});

check('K7 overview history contains resolved incident', async () => {
  const overview = await req('/vault/auth/incidents', { token: tokens.alice, expect: 200 });
  assert.equal(overview.data.activeIncident, null);
  assert.ok(overview.data.history.some((h) => Number(h.id) === incidentId), 'history contains incident');
  assert.ok(overview.data.canStart === true, 'can start again');
});

/* ------------------------------------------------------------------ */
/* Estate playbooks                                                    */
/* ------------------------------------------------------------------ */

let estatePlaybookId;
let estateExecutionId;

check('L1 create estate playbook on vault item', async () => {
  const created = await req('/api/vault', {
    method: 'POST',
    token: tokens.alice,
    json: { itemType: 'PASSWORD', title: 'Estate Login', usernameValue: 'estate@example.com', encryptedPassword: 'ZW5jcnl', website: null },
    expect: 201,
  });
  const itemId = Number(created.data.id);

  const r = await req('/vault/estate-playbooks', {
    method: 'POST',
    token: tokens.alice,
    json: {
      itemType: 'PASSWORD',
      itemId,
      actionType: 'RELEASE',
      triggerType: 'OWNER_RELEASE',
      recipientContactId: aliceContactId,
      instructions: 'Release the estate login after review.',
    },
    expect: 201,
  });
  has(r.data, 'id');
  has(r.data, 'itemType');
  has(r.data, 'actionType');
  estatePlaybookId = Number(r.data.id);
});

check('L2 estate overview + pause + resume', async () => {
  const overview = await req('/vault/estate-playbooks', { token: tokens.alice, expect: 200 });
  has(overview.data, 'plan');
  has(overview.data, 'playbooks');
  assert.ok(overview.data.playbooks.some((p) => Number(p.id) === estatePlaybookId), 'playbook in list');

  await req(`/vault/estate-playbooks/${estatePlaybookId}/pause`, { method: 'POST', token: tokens.alice, expect: 200 });
  await req(`/vault/estate-playbooks/${estatePlaybookId}/resume`, { method: 'POST', token: tokens.alice, expect: 200 });
});

check('L3 release estate playbook creates execution', async () => {
  const r = await req(`/vault/estate-playbooks/${estatePlaybookId}/release`, { method: 'POST', token: tokens.alice, expect: 201 });
  has(r.data, 'id');
  has(r.data, 'status');
  estateExecutionId = Number(r.data.id);
});

check('L4 estate released item readable', async () => {
  const r = await req(`/vault/estate-playbooks/executions/${estateExecutionId}/item`, { token: tokens.bob, expect: 200 });
  has(r.data, 'itemType');
});

check('L5 complete estate execution', async () => {
  const r = await req(`/vault/estate-playbooks/executions/${estateExecutionId}/complete`, { method: 'POST', token: tokens.bob, expect: 200 });
  has(r.data, 'status');
});

/* ------------------------------------------------------------------ */
/* Continuity drill                                                    */
/* ------------------------------------------------------------------ */

let continuityDrillId;

check('M1 start continuity drill', async () => {
  const r = await req('/vault/continuity-drill/start', { method: 'POST', token: tokens.alice, expect: 201 });
  has(r.data, 'id');
  has(r.data, 'publicId');
  has(r.data, 'participantCount');
  has(r.data, 'staticScore');
  continuityDrillId = Number(r.data.id);
});

check('M2 continuity overview lists drill', async () => {
  const r = await req('/vault/continuity-drill', { token: tokens.alice, expect: 200 });
  has(r.data, 'plan');
  has(r.data, 'history');
  assert.ok(r.data.activeDrill && Number(r.data.activeDrill.id) === continuityDrillId, 'drill listed as active');
});

check('M3 bob acknowledges drill request', async () => {
  const bobView = await req('/vault/continuity-drill', { token: tokens.bob, expect: 200 });
  const reqs = bobView.data.receivedRequests || [];
  assert.ok(Array.isArray(reqs) && reqs.length > 0, 'bob has a drill request');

  const ack = await req(`/vault/continuity-drill/requests/${encodeURIComponent(reqs[0].publicId)}/acknowledge`, { method: 'POST', token: tokens.bob, expect: 200 });
  has(ack.data, 'status');
  assert.equal(ack.data.status, 'ACKNOWLEDGED');
});

check('M4 complete continuity drill', async () => {
  const r = await req(`/vault/continuity-drill/${continuityDrillId}/complete`, { method: 'POST', token: tokens.alice, expect: 200 });
  has(r.data, 'score');
});

/* ------------------------------------------------------------------ */
/* Recovery kit                                                       */
/* ------------------------------------------------------------------ */

check('N1 recovery kit status', async () => {
  const r = await req('/vault/recovery-kit/status', { token: tokens.alice, expect: 200 });
  has(r.data, 'created');
  has(r.data, 'recoveryId');
});

check('N2 generate + use recovery kit', async () => {
  const gen = await req('/vault/recovery-kit/generate', { method: 'POST', token: tokens.alice, json: { password: 'RotatedIncid!42' }, expect: 201 });
  has(gen.data, 'recoveryId');
  has(gen.data, 'recoveryKey');

  const resetPw = await req('/vault/recovery-kit/reset-password', {
    method: 'POST',
    json: {
      recoveryId: String(gen.data.recoveryId).trim().toUpperCase(),
      recoveryKey: String(gen.data.recoveryKey).trim(),
      newPassword: 'AfterKitReset!77',
    },
    expect: 200,
  });
  has(resetPw.data, 'message');

  const t = await login(aliceEmail, 'AfterKitReset!77');
  assert.ok(t.length > 10);
  tokens.alice = t;
});

/* ------------------------------------------------------------------ */
/* FREE-plan gates                                                     */
/* ------------------------------------------------------------------ */

check('O1 carol (FREE) cannot use incident lockdown', async () => {
  const r = await req('/vault/auth/incidents/start', {
    method: 'POST',
    token: tokens.carol,
    json: { type: 'OTHER', currentPassword: carolPassword },
  });
  assert.ok(r.status === 403, `expected 403, got ${r.status}`);
});

check('O2 carol (FREE) cannot upload documents', async () => {
  const form = new FormData();
  form.append('file', new Blob([Buffer.from('nope')], { type: 'text/plain' }), 'x.txt');
  form.append('documentName', 'Nope');
  form.append('documentType', 'text/plain');
  form.append('sizeBytes', '4');
  const r = await req('/vault/documents/upload', { method: 'POST', token: tokens.carol, form });
  assert.ok(r.status === 403, `expected 403, got ${r.status}`);
});

check('O3 carol (FREE) hits the 5-note limit', async () => {
  for (let i = 1; i <= 5; i += 1) {
    await req('/vault/notes', {
      method: 'POST',
      token: tokens.carol,
      json: { title: `Free note ${i}`, category: 'Other', encryptedContent: 'eA==', pinned: false },
      expect: 201,
    });
  }
  const six = await req('/vault/notes', {
    method: 'POST',
    token: tokens.carol,
    json: { title: 'Sixth note', category: 'Other', encryptedContent: 'eA==', pinned: false },
  });
  assert.ok(six.status === 403, `expected 403 on sixth note, got ${six.status}`);
});

check('O4 carol (FREE) device limit on second login device', async () => {
  const first = await req('/vault/auth/login', {
    method: 'POST',
    json: { email: carolEmail, password: carolPassword, forceReplaceDevice: false },
    headers: { 'X-Guardian-Device-Id': '44444444-4444-4444-8444-444444444441', 'X-Guardian-Device-Name': 'Device One', 'X-Guardian-Device-Type': 'android' },
  });
  assert.ok(
    [200, 409].includes(first.status),
    `first-device login must succeed or hit limit, got ${first.status}: ${JSON.stringify(first.data)}`
  );
  if (first.status === 409) {
    assert.equal(first.data.code || first.data.errorCode, 'DEVICE_LIMIT_REACHED');
    const forced = await req('/vault/auth/login', {
      method: 'POST',
      json: { email: carolEmail, password: carolPassword, forceReplaceDevice: true },
      headers: { 'X-Guardian-Device-Id': '44444444-4444-4444-8444-444444444441', 'X-Guardian-Device-Name': 'Device One', 'X-Guardian-Device-Type': 'android' },
    });
    assert.ok(forced.status === 200, 'force replace device succeeds');
  }

  const second = await req('/vault/auth/login', {
    method: 'POST',
    json: { email: carolEmail, password: carolPassword, forceReplaceDevice: false },
    headers: { 'X-Guardian-Device-Id': '44444444-4444-4444-8444-444444444442', 'X-Guardian-Device-Name': 'Device Two', 'X-Guardian-Device-Type': 'android' },
  });
  assert.ok(second.status === 409, `expected 409 on second free-plan device, got ${second.status}`);
  assert.equal(second.data.code || second.data.errorCode, 'DEVICE_LIMIT_REACHED');

  const forced = await req('/vault/auth/login', {
    method: 'POST',
    json: { email: carolEmail, password: carolPassword, forceReplaceDevice: true },
    headers: { 'X-Guardian-Device-Id': '44444444-4444-4444-8444-444444444442', 'X-Guardian-Device-Name': 'Device Two', 'X-Guardian-Device-Type': 'android' },
  });
  assert.ok(forced.status === 200, 'force replace device succeeds');
});

/* ------------------------------------------------------------------ */
/* Notification permission + push token                                */
/* ------------------------------------------------------------------ */

check('P1 notification preferences', async () => {
  const prefs = await req('/vault/notifications/preferences', { token: tokens.alice, expect: 200 });
  has(prefs.data, 'pushEnabled');
});

check('P2 push token register', async () => {
  const r = await req('/vault/notifications/push-token', {
    method: 'PUT',
    token: tokens.alice,
    expect: 200,
    json: { installationId: 'ltc-inst-' + stamp, expoPushToken: 'ExponentPushToken[ltc-' + stamp + ']', platform: 'android', deviceName: 'Contract Test Device', appVersion: '1.0.0' },
  });
  assert.equal(r.data.registered, true);
});

/* ------------------------------------------------------------------ */
/* Auth expiry / 2FA                                                   */
/* ------------------------------------------------------------------ */

check('Q1 password reset flow (forgot + reset)', async () => {
  await req('/vault/auth/forgot-password', { method: 'POST', json: { email: bobEmail }, expect: 200 });
  const code = await harnessCode(bobEmail);
  assert.ok(/^\d{6}$/.test(String(code ?? '')), `reset code is 6 digits (got ${JSON.stringify(code)})`);
  await req('/vault/auth/reset-password', {
    method: 'POST',
    json: { email: bobEmail, code, newPassword: 'SecondReset!66' },
    expect: 200,
  });
  const t = await login(bobEmail, 'SecondReset!66');
  assert.ok(t.length > 10);
  tokens.bob = t;
});

check('Q2 unauth request returns 401', async () => {
  const r = await req('/vault/api/subscriptions/me');
  assert.ok(r.status === 401, `expected 401, got ${r.status}`);
});

check('Q3 unknown route returns 404', async () => {
  const r = await req('/vault/does-not-exist-xyz', { token: tokens.alice });
  assert.equal(r.status, 404);
});

/* ------------------------------------------------------------------ */

runAll().catch((err) => {
  console.error('Contract harness crashed:', err);
  process.exit(2);
});