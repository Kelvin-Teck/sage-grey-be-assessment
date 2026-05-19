import { Knex } from "knex";
import { db } from "../config/database";

export interface IdempotencyRecord {
  key: string;
  user_id: string;
  request_path: string;
  response_body: string | null;
  response_status: number | null;
  execution_status: "in_progress" | "completed" | "failed";
  created_at: Date;
}

export class IdempotencyRepository {
  private tableName = "idempotency_keys";

  async findByKey(key: string): Promise<IdempotencyRecord | undefined> {
    return db(this.tableName).where({ key }).first();
  }

  async create(record: {
    key: string;
    user_id: string;
    request_path: string;
  }): Promise<void> {
    await db(this.tableName).insert({
      key: record.key,
      user_id: record.user_id,
      request_path: record.request_path,
      execution_status: "in_progress",
    });
  }

  async updateResult(
    key: string,
    status: "completed" | "failed",
    statusCode: number,
    responseBody: any,
  ): Promise<void> {
    const payloadStr =
      typeof responseBody === "object"
        ? JSON.stringify(responseBody)
        : responseBody;

    await db(this.tableName).where({ key }).update({
      execution_status: status,
      response_status: statusCode,
      response_body: payloadStr,
    });
  }

  async tryInsertInProgress(
    key: string,
    userId: string,
    requestPath: string,
  ): Promise<boolean> {
    try {
      await db(this.tableName).insert({
        key,
        user_id: userId,
        request_path: requestPath,
        execution_status: 'in_progress',
      });
      return true;
    } catch (err: any) {
      // Unique constraint violation — key already exists
      if (err?.code === '23505' || err?.message?.includes('unique')) {
        return false;
      }
      throw err;
    }
  }

  /**
   * Atomically insert or update an idempotency record.
   * Called by the service layer inside its own db.transaction() so that
   * the wallet balance update and the idempotency commit are one atomic unit.
   */
  async upsert(
    record: {
      key: string;
      user_id: string;
      execution_status: "completed" | "failed";
      response_status: number;
      response_body: string;
    },
    trx: Knex.Transaction,
  ): Promise<void> {
    const payloadStr =
      typeof record.response_body === "object"
        ? JSON.stringify(record.response_body)
        : record.response_body;

    const parts = record.key.split(':');
    const requestPath = parts.length >= 4 ? parts[2] : "";

    await trx(this.tableName)
      .insert({
        key: record.key,
        user_id: record.user_id,
        request_path: requestPath,
        execution_status: record.execution_status,
        response_status: record.response_status,
        response_body: payloadStr,
      })
      .onConflict("key")
      .merge({
        execution_status: record.execution_status,
        response_status: record.response_status,
        response_body: payloadStr,
      });
  }
}
