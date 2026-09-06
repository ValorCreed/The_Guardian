"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.env = void 0;
require("dotenv/config");
const zod_1 = require("zod");
const envSchema = zod_1.z.object({
    NODE_ENV: zod_1.z.enum(['development', 'test', 'production']).default('development'),
    PORT: zod_1.z.coerce.number().default(4000),
    DATABASE_URL: zod_1.z.string().default('postgres://guardian:guardian@localhost:5432/guardian'),
    JWT_SECRET: zod_1.z.string().min(16, 'JWT_SECRET must be at least 16 characters'),
    JWT_EXPIRES_IN: zod_1.z.string().default('7d'),
    VAULT_ENCRYPTION_KEY: zod_1.z
        .string()
        .min(16, 'VAULT_ENCRYPTION_KEY must be at least 16 characters (32 preferred)'),
    SMTP_HOST: zod_1.z.string().optional(),
    SMTP_PORT: zod_1.z.coerce.number().optional(),
    SMTP_SECURE: zod_1.z
        .string()
        .default('false')
        .transform((v) => v === 'true' || v === '1'),
    SMTP_USER: zod_1.z.string().optional(),
    SMTP_PASS: zod_1.z.string().optional(),
    EMAIL_FROM: zod_1.z.string().email().default('no-reply@guardian.vault'),
    EXPO_ACCESS_TOKEN: zod_1.z.string().optional(),
    PAYSTACK_SECRET_KEY: zod_1.z.string().optional(),
    PAYSTACK_PUBLIC_KEY: zod_1.z.string().optional(),
    PAYMENTS_SANDBOX: zod_1.z
        .string()
        .default('true')
        .transform((v) => v === 'true' || v === '1'),
    PAYMENT_PROVIDER: zod_1.z.string().default('paystack'),
    APP_ORIGIN: zod_1.z.string().default('https://guardian-vault-gateway.onrender.com'),
    STORAGE_DIR: zod_1.z.string().default('./storage'),
    ALLOWED_ORIGINS: zod_1.z.string().default('*'),
    CODE_EXPIRES_IN_MINUTES: zod_1.z.coerce.number().default(10),
    SESSION_TTL_DAYS: zod_1.z.coerce.number().default(30),
    MAX_DOCUMENT_BYTES: zod_1.z.coerce.number().default(25 * 1024 * 1024),
});
function loadEnv() {
    const parsed = envSchema.safeParse(process.env);
    if (!parsed.success) {
        const missing = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
        throw new Error(`Invalid environment configuration: ${missing}`);
    }
    const env = parsed.data;
    if (env.NODE_ENV === 'production') {
        if (env.JWT_SECRET === 'change-me-in-production') {
            throw new Error('JWT_SECRET must be changed in production.');
        }
        if (env.VAULT_ENCRYPTION_KEY === 'change-me-in-production') {
            throw new Error('VAULT_ENCRYPTION_KEY must be changed in production.');
        }
    }
    return env;
}
exports.env = loadEnv();
//# sourceMappingURL=env.js.map