"use strict";
// Runs before any test module is imported so that src/config/env.ts picks up
// a full, valid configuration. Point DATABASE_URL at a disposable Postgres
// database (see NEXT_STEPS.md); tests truncate all tables on startup.
process.env.NODE_ENV = 'test';
process.env.PORT = '4001';
process.env.JWT_SECRET = 'test-only-jwt-secret-0123456789abcdef';
process.env.VAULT_ENCRYPTION_KEY = 'test-only-vault-key-0123456789abcdef';
process.env.SMTP_HOST = '';
process.env.EXPO_ACCESS_TOKEN = '';
process.env.PAYMENTS_SANDBOX = 'true';
process.env.STORAGE_DIR = require('node:os').tmpdir() + '/guardian-test-storage';
process.env.DATABASE_URL =
    process.env.TEST_DATABASE_URL || 'postgres://guardian:guardian@localhost:5432/guardian_test';
process.env.JWT_EXPIRES_IN = '1d';
process.env.CODE_EXPIRES_IN_MINUTES = '10';
//# sourceMappingURL=setup-env.js.map