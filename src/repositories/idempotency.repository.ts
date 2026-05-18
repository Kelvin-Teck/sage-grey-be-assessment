import { db } from '../config/database';

export interface IdempotencyRecord {
  key: string;
  user_id: string;
  request_path: string;
  response_body: string | null;
  response_status: number | null;
  execution_status: 'in_progress' | 'completed' | 'failed';
  created_at: Date;
}

export class IdempotencyRepository {
  private tableName = 'idempotency_keys';

  async findByKey(key: string): Promise<IdempotencyRecord | undefined> {
    const record = await db(this.tableName).where({ key }).first();
    return record;
  }

  async create(record: { key: string; user_id: string; request_path: string }): Promise<void> {
    await db(this.tableName).insert({
      key: record.key,
      user_id: record.user_id,
      request_path: record.request_path,
      execution_status: 'in_progress',
    });
  }

  async updateResult(key: string, status: 'completed' | 'failed', statusCode: number, responseBody: any): Promise<void> {
    const payloadStr = typeof responseBody === 'object' ? JSON.stringify(responseBody) : responseBody;
    await db(this.tableName).where({ key }).update({
      execution_status: status,
      response_status: statusCode,
      response_body: payloadStr,
    });
  }
}
