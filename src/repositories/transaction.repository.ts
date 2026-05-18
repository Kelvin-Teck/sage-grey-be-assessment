import { Knex } from 'knex';
import { db } from '../config/database';
import { Transaction } from '../models';

export class TransactionRepository {
  private tableName = 'transactions';

  async create(transaction: Omit<Transaction, 'id' | 'created_at'>, trx?: Knex.Transaction): Promise<Transaction> {
    const query = trx ? trx(this.tableName) : db(this.tableName);
    const [createdTransaction] = await query.insert({
      wallet_id: transaction.wallet_id,
      type: transaction.type,
      amount: transaction.amount,
      reference: transaction.reference,
      description: transaction.description,
      recipient_wallet_id: transaction.recipient_wallet_id || null,
      status: transaction.status,
    }).returning('*');
    if (createdTransaction) {
      createdTransaction.amount = Number(createdTransaction.amount);
    }
    return createdTransaction;
  }

  async findByWalletId(walletId: string, limit = 50, offset = 0): Promise<Transaction[]> {
    const transactions = await db(this.tableName)
      .where({ wallet_id: walletId })
      .orderBy('created_at', 'desc')
      .limit(limit)
      .offset(offset);
      
    return transactions.map(t => ({ ...t, amount: Number(t.amount) }));
  }
}
