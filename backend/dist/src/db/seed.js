"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const migrate_1 = require("./migrate");
const pool_1 = require("./pool");
/**
 * Demo data for local development. Creates a demo FREE user and a DEMO
 * PREMIUM user so every screen can be exercised without a real sign-up.
 *
 * Credentials:
 *   demo@guardian.app / DemoPass123!
 *   premium@guardian.app / DemoPass123!
 */
async function ensureUser(email, plan) {
    const existing = await (0, pool_1.row)('SELECT id FROM users WHERE email = $1', [email]);
    if (existing) {
        await (0, pool_1.query)(`UPDATE subscriptions SET plan = $2 WHERE user_id = $1`, [existing.id, plan]);
        console.log(`[seed] ${email} already exists (plan=${plan})`);
        return;
    }
    const passwordHash = await bcryptjs_1.default.hash(plan === 'FREE' ? 'DemoPass123!' : 'DemoPass123!', 10);
    const fullName = email.split('@')[0].replace(/(^|[-_])/g, ($0) => ($0 === '-' || $0 === '_' ? ' ' : '')).replace(/\b\w/g, (c) => c.toUpperCase());
    const client = await pool_1.pool.connect();
    try {
        await client.query('BEGIN');
        const user = await client.query(`INSERT INTO users (email, full_name, password_hash) VALUES ($1, $2, $3) RETURNING id`, [email, fullName, passwordHash]);
        await client.query(`INSERT INTO subscriptions (user_id, plan, status, auto_renew) VALUES ($1, $2, 'ACTIVE', $2 <> 'FREE')`, [user.rows[0].id, plan]);
        await client.query(`INSERT INTO notifications (user_id, type, title, body, route) VALUES ($1, 'WELCOME', 'Welcome to The Guardian', 'Explore the app and secure your vault.', '/home')`, [user.rows[0].id]);
        await client.query('COMMIT');
        console.log(`[seed] created ${email} (${plan})`);
    }
    catch (err) {
        await client.query('ROLLBACK');
        throw err;
    }
    finally {
        client.release();
    }
}
async function seed() {
    await (0, migrate_1.migrate)();
    await ensureUser('demo@guardian.app', 'FREE');
    await ensureUser('premium@guardian.app', 'PREMIUM');
    await ensureUser('family@guardian.app', 'FAMILY');
    console.log('[seed] done');
}
if (require.main === module) {
    seed()
        .then(() => pool_1.pool.end())
        .catch((err) => {
        console.error('[seed] failed', err);
        process.exit(1);
    });
}
//# sourceMappingURL=seed.js.map