"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.migrate = migrate;
const pool_1 = require("./pool");
const schema_1 = require("./schema");
async function migrate() {
    await (0, pool_1.query)('SELECT 1');
    await (0, pool_1.query)(`CREATE TABLE IF NOT EXISTS schema_migrations (
    id TEXT PRIMARY KEY,
    applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`);
    const migrations = [
        { id: schema_1.MIGRATION_ID, sql: schema_1.SCHEMA_SQL },
        { id: schema_1.MIGRATION_002_ID, sql: schema_1.MIGRATION_002_SQL },
        { id: schema_1.MIGRATION_003_ID, sql: schema_1.MIGRATION_003_SQL },
        { id: schema_1.MIGRATION_004_ID, sql: schema_1.MIGRATION_004_SQL },
    ];
    for (const migration of migrations) {
        const applied = await (0, pool_1.row)('SELECT id FROM schema_migrations WHERE id = $1', [migration.id]);
        if (applied)
            continue;
        const client = await pool_1.pool.connect();
        try {
            await client.query('BEGIN');
            await client.query(migration.sql);
            await client.query('INSERT INTO schema_migrations (id) VALUES ($1)', [migration.id]);
            await client.query('COMMIT');
            console.log(`[migrate] applied ${migration.id}`);
        }
        catch (err) {
            await client.query('ROLLBACK');
            throw err;
        }
        finally {
            client.release();
        }
    }
}
if (require.main === module) {
    migrate()
        .then(() => pool_1.pool.end())
        .catch((err) => {
        console.error('[migrate] failed', err);
        process.exit(1);
    });
}
//# sourceMappingURL=migrate.js.map