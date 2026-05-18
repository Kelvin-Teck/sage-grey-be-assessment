import { db } from '../config/database';

export class TokenBlacklistRepository {
  private tableName = 'token_blacklist';

  async blacklist(token: string, expiresAt: Date): Promise<void> {
    try {
      const existing = await db(this.tableName).where({ token }).first();
      if (!existing) {
        await db(this.tableName).insert({
          token,
          expires_at: expiresAt,
        });
      }
    } catch (err) {
      // Ignore if duplicate key violation
    }
  }

  async isBlacklisted(token: string): Promise<boolean> {
    try {
      const record = await db(this.tableName).where({ token }).first();
      return !!record;
    } catch (err) {
      return false;
    }
  }
}
