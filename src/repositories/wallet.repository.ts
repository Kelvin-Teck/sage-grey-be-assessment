import { Knex } from 'knex';
import { db } from '../config/database';
import { Wallet } from '../models';

export class WalletRepository {
  private tableName = 'wallets';

  async findByUserId(userId: string, trx?: Knex.Transaction, lockForUpdate = false): Promise<Wallet | undefined> {
    const query = trx ? trx(this.tableName) : db(this.tableName);
    let builder = query.where({ user_id: userId }).first();

    if (lockForUpdate && trx) {
      builder = builder.forUpdate();
    }

    const wallet = await builder;
    if (wallet) {
      wallet.balance = Number(wallet.balance);
    }
    return wallet;
  }

  async findById(id: string, trx?: Knex.Transaction, lockForUpdate = false): Promise<Wallet | undefined> {
    const query = trx ? trx(this.tableName) : db(this.tableName);
    let builder = query.where({ id }).first();

    if (lockForUpdate && trx) {
      builder = builder.forUpdate();
    }

    const wallet = await builder;
    if (wallet) {
      wallet.balance = Number(wallet.balance);
    }
    return wallet;
  }

  async create(wallet: Omit<Wallet, 'id' | 'created_at' | 'updated_at'>, trx?: Knex.Transaction): Promise<Wallet> {
    const query = trx ? trx(this.tableName) : db(this.tableName);
    const [createdWallet] = await query.insert({
      user_id: wallet.user_id,
      balance: wallet.balance,
      currency: wallet.currency,
    }).returning('*');
    if (createdWallet) {
      createdWallet.balance = Number(createdWallet.balance);
    }
    return createdWallet;
  }

  async updateBalance(id: string, newBalance: number, trx: Knex.Transaction): Promise<Wallet> {
    const [updatedWallet] = await trx(this.tableName)
      .where({ id })
      .update({ balance: newBalance, updated_at: new Date() })
      .returning('*');
    if (updatedWallet) {
      updatedWallet.balance = Number(updatedWallet.balance);
    }
    return updatedWallet;
  }
}
