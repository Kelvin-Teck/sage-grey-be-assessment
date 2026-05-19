import crypto from 'crypto';
import { db } from '../config/database';

export class TokenBlacklistRepository {
  private tableName = 'token_blacklist';


  static hashToken(token: string): string {
    return crypto.createHash('sha256').update(token).digest('hex');
  }

  /**
   * Record a token as blacklisted.
   * @param tokenHash  Pre-computed SHA-256 hash of the raw JWT.
   * @param expiresAt  Natural expiry of the token (from its `exp` claim).
   */
  async blacklist(tokenHash: string, expiresAt: Date): Promise<void> {
    try {
      await db(this.tableName).insert({ token_hash: tokenHash, expires_at: expiresAt });
    } catch (err: any) {
      // L2: only ignore duplicate-key violations (23505 = unique constraint in Postgres).
      // All other errors (connection failure, schema mismatch, etc.) must be rethrown.
      if (err?.code !== '23505') {
        throw err;
      }
    }
  }


  async isBlacklisted(tokenHash: string): Promise<boolean> {
    const record = await db(this.tableName)
      .where({ token_hash: tokenHash })
      .where('expires_at', '>', new Date())
      .first();
    return !!record;
  }

 
  async deleteExpired(): Promise<number> {
    return db(this.tableName)
      .where('expires_at', '<=', new Date())
      .delete();
  }
}
