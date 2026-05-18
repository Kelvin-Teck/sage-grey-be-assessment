import knex from 'knex';
import dotenv from 'dotenv';
import { logger } from '../utils/logger';

dotenv.config();

const initDatabase = async () => {
  const targetDbName = process.env.DATABASE_NAME || 'sage_grey_wallet';
  const environment = process.env.NODE_ENV || 'development';

  if (environment === 'test') {
    logger.info('Test environment detected. Skipping physical PostgreSQL DB creation.');
    process.exit(0);
  }

  // Connect to default PostgreSQL maintenance database ('postgres')
  const maintenanceDb = knex({
    client: 'pg',
    connection: {
      host: process.env.DATABASE_HOST || 'localhost',
      port: Number(process.env.DATABASE_PORT) || 5432,
      user: process.env.DATABASE_USER || 'postgres',
      password: process.env.DATABASE_PASSWORD || 'postgres',
      database: 'postgres', // Maintenance DB guaranteed to exist
    },
  });

  try {
    const res = await maintenanceDb.raw('SELECT 1 FROM pg_database WHERE datname = ?', [targetDbName]);

    if (res.rowCount === 0) {
      logger.info(`Database "${targetDbName}" not found. Creating it now...`);
      await maintenanceDb.raw(`CREATE DATABASE "${targetDbName}"`);
      logger.info(`Database "${targetDbName}" created successfully!`);
    } else {
      logger.info(`Database "${targetDbName}" verified successfully.`);
    }
  } catch (error) {
    logger.error(`Failed to verify/create database "${targetDbName}":`, error);
  } finally {
    await maintenanceDb.destroy();
    process.exit(0);
  }
};

initDatabase();
