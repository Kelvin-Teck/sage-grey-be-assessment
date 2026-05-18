import knex from 'knex';
import config from './knexfile';
import { env } from './env';
import { newDb, DataType } from 'pg-mem';
import crypto from 'crypto';

let dbInstance: knex.Knex;

if (env.NODE_ENV === 'test') {
  const mem = newDb();

  const origQuery = mem.public.query.bind(mem.public);
  mem.public.query = (text: string) => {
    const modifiedSql = text.replace(/decimal\(\s*15\s*,\s*2\s*\)/gi, 'decimal');
    return origQuery(modifiedSql);
  };

  mem.public.registerFunction({
    name: 'gen_random_uuid',
    args: [],
    returns: DataType.uuid,
    impure: true,
    implementation: () => crypto.randomUUID(),
  });
  mem.public.registerFunction({
    name: 'now',
    args: [],
    returns: DataType.timestamp,
    impure: true,
    implementation: () => new Date(),
  });

  const testConfig = {
    ...config.development,
    client: 'pg',
    connection: {},
  };

  dbInstance = mem.adapters.createKnex(0, testConfig) as knex.Knex;
} else {
  const environment = env.NODE_ENV || 'development';
  dbInstance = knex(config[environment]);
}

export const db = dbInstance;
