"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.pool = void 0;
exports.query = query;
exports.rows = rows;
exports.row = row;
exports.withTransaction = withTransaction;
exports.connect = connect;
const pg_1 = require("pg");
const env_1 = require("../config/env");
exports.pool = new pg_1.Pool({
    connectionString: env_1.env.DATABASE_URL,
    max: env_1.env.NODE_ENV === 'test' ? 5 : 20,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
    ssl: env_1.env.NODE_ENV === 'production'
        ? { rejectUnauthorized: false }
        : undefined,
});
exports.pool.on('error', (err) => {
    console.error('[pg] unexpected pool error', err.message);
});
/** Run a parameterized query and return the full pg result. */
async function query(text, params) {
    return exports.pool.query(text, params);
}
/** Run a parameterized query and return every row. */
async function rows(text, params) {
    const result = await exports.pool.query(text, params);
    return result.rows;
}
/** Run a parameterized query and return the first row, or null. */
async function row(text, params) {
    const result = await exports.pool.query(text, params);
    return result.rows[0] ?? null;
}
async function withTransaction(fn) {
    const client = await exports.pool.connect();
    try {
        await client.query('BEGIN');
        const result = await fn(client);
        await client.query('COMMIT');
        return result;
    }
    catch (err) {
        await client.query('ROLLBACK');
        throw err;
    }
    finally {
        client.release();
    }
}
async function connect() {
    await exports.pool.query('SELECT 1');
}
//# sourceMappingURL=pool.js.map