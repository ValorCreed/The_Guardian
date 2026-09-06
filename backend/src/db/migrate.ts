import { pool, query, row } from './pool';
import { SCHEMA_SQL, MIGRATION_ID, MIGRATION_002_ID, MIGRATION_002_SQL, MIGRATION_003_ID, MIGRATION_003_SQL, MIGRATION_004_ID, MIGRATION_004_SQL } from './schema';

export async function migrate(): Promise<void> {
  await query('SELECT 1');
  await query(`CREATE TABLE IF NOT EXISTS schema_migrations (
    id TEXT PRIMARY KEY,
    applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`);

  const migrations: Array<{ id: string; sql: string }> = [
    { id: MIGRATION_ID, sql: SCHEMA_SQL },
    { id: MIGRATION_002_ID, sql: MIGRATION_002_SQL },
    { id: MIGRATION_003_ID, sql: MIGRATION_003_SQL },
    { id: MIGRATION_004_ID, sql: MIGRATION_004_SQL },
  ];

  for (const migration of migrations) {
    const applied = await row<{ id: string }>('SELECT id FROM schema_migrations WHERE id = $1', [migration.id]);
    if (applied) continue;

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(migration.sql);
      await client.query('INSERT INTO schema_migrations (id) VALUES ($1)', [migration.id]);
      await client.query('COMMIT');
      console.log(`[migrate] applied ${migration.id}`);
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }
}

if (require.main === module) {
  migrate()
    .then(() => pool.end())
    .catch((err) => {
      console.error('[migrate] failed', err);
      process.exit(1);
    });
}