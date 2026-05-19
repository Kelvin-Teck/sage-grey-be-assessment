import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

const envSchema = z.object({
  PORT: z.string().default('3000'),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  JWT_SECRET: z.string().min(10, 'JWT_SECRET must be at least 10 characters long'),
  JWT_EXPIRES_IN: z.string().default('1d'),
  BCRYPT_ROUNDS: z.string().transform(Number).default('12'),
  ALLOWED_ORIGINS: z.string().default('http://localhost:3000'),
  DATABASE_CLIENT: z.string().default('pg'),
  DATABASE_HOST: z.string().default('localhost'),
  DATABASE_PORT: z.string().transform(Number).default('5432'),
  DATABASE_USER: z.string().default('postgres'),
  DATABASE_PASSWORD: z.string().default('postgres'),
  DATABASE_NAME: z.string().default('sage_grey_wallet'),
});

const _env = envSchema.safeParse(process.env);

if (!_env.success) {
  console.error('Invalid environment variables:', _env.error.format());
  throw new Error('Invalid environment variables');
}

export const env = _env.data;
