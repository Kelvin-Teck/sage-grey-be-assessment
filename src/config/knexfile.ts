import type { Knex } from 'knex';
import dotenv from 'dotenv';
import path from 'path';

// Knex CLI automatically changes CWD to the directory of knexfile.ts (src/config).
// During tests or app runtime, CWD is the project root.
const isConfigDir = process.cwd().endsWith('config');

// Ensure dotenv always loads from the project root .env file
dotenv.config({
  path: isConfigDir ? path.resolve(process.cwd(), '../../.env') : path.resolve(process.cwd(), './.env'),
});

const baseDir = isConfigDir
  ? path.resolve(process.cwd(), '..') // move up from src/config to src
  : path.resolve(process.cwd(), './src'); // move into src from project root

const migrationsDir = path.resolve(baseDir, './migrations');

const config: { [key: string]: Knex.Config } = {
  development: {
    client: 'pg',
    connection: {
      host: process.env.DATABASE_HOST || 'localhost',
      port: Number(process.env.DATABASE_PORT) || 5432,
      user: process.env.DATABASE_USER || 'postgres',
      password: process.env.DATABASE_PASSWORD || 'postgres',
      database: process.env.DATABASE_NAME || 'sage_grey_wallet',
    },
    pool: {
      min: 2,
      max: 10,
    },
    migrations: {
      directory: migrationsDir,
      extension: 'ts',
    },
  },

  test: {
    client: 'sqlite3',
    connection: {
      filename: ':memory:',
    },
    useNullAsDefault: true,
    migrations: {
      directory: migrationsDir,
      extension: 'ts',
    },
  },

  production: {
    client: 'pg',
    connection: {
      host: process.env.DATABASE_HOST,
      port: Number(process.env.DATABASE_PORT),
      user: process.env.DATABASE_USER,
      password: process.env.DATABASE_PASSWORD,
      database: process.env.DATABASE_NAME,
      ssl: { rejectUnauthorized: false },
    },
    pool: {
      min: 2,
      max: 10,
    },
    migrations: {
      directory: migrationsDir,
      extension: 'ts',
    },
  },
};

export default config;
