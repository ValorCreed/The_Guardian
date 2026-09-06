import 'dotenv/config';
import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().default(4000),
  DATABASE_URL: z.string().default('postgres://guardian:guardian@localhost:5432/guardian'),
  JWT_SECRET: z.string().min(16, 'JWT_SECRET must be at least 16 characters'),
  JWT_EXPIRES_IN: z.string().default('7d'),
  VAULT_ENCRYPTION_KEY: z
    .string()
    .min(16, 'VAULT_ENCRYPTION_KEY must be at least 16 characters (32 preferred)'),
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().optional(),
  SMTP_SECURE: z
    .string()
    .default('false')
    .transform((v) => v === 'true' || v === '1'),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  EMAIL_FROM: z.string().email().default('no-reply@guardian.vault'),
  EXPO_ACCESS_TOKEN: z.string().optional(),
  PAYSTACK_SECRET_KEY: z.string().optional(),
  PAYSTACK_PUBLIC_KEY: z.string().optional(),
  PAYMENTS_SANDBOX: z
    .string()
    .default('true')
    .transform((v) => v === 'true' || v === '1'),
  PAYMENT_PROVIDER: z.string().default('paystack'),
  APP_ORIGIN: z.string().default('https://guardian-vault-gateway.onrender.com'),
  STORAGE_DIR: z.string().default('./storage'),
  ALLOWED_ORIGINS: z.string().default('*'),
  CODE_EXPIRES_IN_MINUTES: z.coerce.number().default(10),
  SESSION_TTL_DAYS: z.coerce.number().default(30),
  MAX_DOCUMENT_BYTES: z.coerce.number().default(25 * 1024 * 1024),
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

export const env = loadEnv();