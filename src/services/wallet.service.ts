import crypto from "crypto";
import Decimal from "decimal.js";
import { db } from "../config/database";
import { WalletRepository } from "../repositories/wallet.repository";
import { TransactionRepository } from "../repositories/transaction.repository";
import { UserRepository } from "../repositories/user.repository";
import { IdempotencyRepository } from "../repositories/idempotency.repository";
import { BadRequestError, NotFoundError, InternalServerError } from "../errors";
import { Wallet, Transaction } from "../models";

export interface TransferResult {
  senderWallet: Wallet;
  transaction: Transaction;
}

export interface GetWalletResult {
  wallet: Wallet;
  transactions: Transaction[];
  pagination: {
    page: number;
    limit: number;
    offset: number;
  };
}

const MIN_AMOUNT = 0.01;
const MAX_AMOUNT = 10_000_000;
const MAX_PAGE_LIMIT = 100;

export class WalletService {
  private walletRepository = new WalletRepository();
  private transactionRepository = new TransactionRepository();
  private userRepository = new UserRepository();
  private idempotencyRepository = new IdempotencyRepository();

  // ── getWallet ─────────────────────────────────────────────────────────────
  
  async getWallet(
    userId: string,
    page = 1,
    limit = 20,
  ): Promise<GetWalletResult> {
    const safeLimit = Math.min(limit, MAX_PAGE_LIMIT);
    const offset = (page - 1) * safeLimit;

    const wallet = await this.walletRepository.findByUserId(userId);
    if (!wallet) {
      throw new NotFoundError("Wallet not found");
    }

    const transactions = await this.transactionRepository.findByWalletId(
      wallet.id,
      safeLimit,
      offset,
    );

    return {
      wallet,
      transactions,
      pagination: { page, limit: safeLimit, offset },
    };
  }

  // ── fund ──────────────────────────────────────────────────────────────────
  
  async fund(
    userId: string,
    amount: number,
    idempotencyKey?: string, 
  ): Promise<{ wallet: Wallet; transaction: Transaction }> {
    this.assertValidAmount(amount);

    return db.transaction(async (trx) => {
      const wallet = await this.walletRepository.findByUserId(
        userId,
        trx,
        true,
      );
      if (!wallet) {
        throw new NotFoundError("Wallet not found");
      }

      const newBalance = new Decimal(wallet.balance).plus(amount).toNumber();

      const updatedWallet = await this.walletRepository.updateBalance(
        wallet.id,
        newBalance,
        trx,
      );

      const transaction = await this.transactionRepository.create(
        {
          wallet_id: wallet.id,
          type: "deposit",
          amount,
          reference: this.generateReference("DEP"),
          description: "Account funding via deposit",
          status: "completed",
        },
        trx,
      );

      const result = { wallet: updatedWallet, transaction };

      // ── Write idempotency record inside the SAME db.transaction() ───────
     
      if (idempotencyKey) {
        await this.idempotencyRepository.upsert(
          {
            key: idempotencyKey,
            user_id: userId,
            execution_status: "completed",
            response_status: 200,
            response_body: JSON.stringify({
              status: "success",
              message: "Account funded successfully",
              data: result,
            }),
          },
          trx, // ← same transaction object — this is the critical part
        );
      }

      return result;
    });
  }

  // ── withdraw ──────────────────────────────────────────────────────────────

  async withdraw(
    userId: string,
    amount: number,
    idempotencyKey?: string, 
  ): Promise<{ wallet: Wallet; transaction: Transaction }> {
    this.assertValidAmount(amount);

    return db.transaction(async (trx) => {
      const wallet = await this.walletRepository.findByUserId(
        userId,
        trx,
        true,
      );
      if (!wallet) {
        throw new NotFoundError("Wallet not found");
      }

      if (new Decimal(wallet.balance).lessThan(amount)) {
        throw new BadRequestError("Insufficient wallet balance");
      }

      const newBalance = new Decimal(wallet.balance).minus(amount).toNumber();

      if (newBalance < 0) {
        throw new InternalServerError(
          "Balance calculation produced a negative value",
        );
      }

      const updatedWallet = await this.walletRepository.updateBalance(
        wallet.id,
        newBalance,
        trx,
      );

      const transaction = await this.transactionRepository.create(
        {
          wallet_id: wallet.id,
          type: "withdrawal",
          amount,
          reference: this.generateReference("WTH"),
          description: "Funds withdrawal from account",
          status: "completed",
        },
        trx,
      );

      const result = { wallet: updatedWallet, transaction };

      if (idempotencyKey) {
        await this.idempotencyRepository.upsert(
          {
            key: idempotencyKey,
            user_id: userId,
            execution_status: "completed",
            response_status: 200,
            response_body: JSON.stringify({
              status: "success",
              message: "Funds withdrawn successfully",
              data: result,
            }),
          },
          trx,
        );
      }

      return result;
    });
  }

  // ── transfer ──────────────────────────────────────────────────────────────

  async transfer(
    senderUserId: string,
    recipientIdentifier: string,
    amount: number,
    idempotencyKey?: string, 
  ): Promise<TransferResult> {
    this.assertValidAmount(amount);

    return db.transaction(async (trx) => {
      const senderUser = await this.userRepository.findById(senderUserId, trx);
      if (!senderUser) throw new NotFoundError("Sender user not found");

      const isUuid =
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
          recipientIdentifier,
        );

      const recipientUser =
        (await this.userRepository.findByEmail(recipientIdentifier, trx)) ??
        (isUuid
          ? await this.userRepository.findById(recipientIdentifier, trx)
          : undefined);

      if (!recipientUser) throw new NotFoundError("Recipient user not found");

      if (senderUser.id === recipientUser.id) {
        throw new BadRequestError("Cannot transfer funds to your own wallet");
      }

      const [senderWalletRef, recipientWalletRef] = await Promise.all([
        this.walletRepository.findByUserId(senderUser.id, trx),
        this.walletRepository.findByUserId(recipientUser.id, trx),
      ]);

      if (!senderWalletRef || !recipientWalletRef) {
        throw new NotFoundError("One or both wallets not found");
      }

      const lockOrder = [senderWalletRef.id, recipientWalletRef.id].sort();
      const lockedWallets = new Map<string, Wallet>();

      for (const id of lockOrder) {
        const locked = await this.walletRepository.findById(id, trx, true);
        if (!locked) {
          throw new InternalServerError(
            `Failed to acquire lock for wallet ${id}`,
          );
        }
        lockedWallets.set(id, locked);
      }

      const senderWallet = lockedWallets.get(senderWalletRef.id)!;
      const recipientWallet = lockedWallets.get(recipientWalletRef.id)!;

      if (new Decimal(senderWallet.balance).lessThan(amount)) {
        throw new BadRequestError("Insufficient wallet balance");
      }

      const newSenderBalance = new Decimal(senderWallet.balance)
        .minus(amount)
        .toNumber();
      const newRecipientBalance = new Decimal(recipientWallet.balance)
        .plus(amount)
        .toNumber();

      if (newSenderBalance < 0) {
        throw new InternalServerError(
          "Balance calculation produced a negative value",
        );
      }

      const updatedSenderWallet = await this.walletRepository.updateBalance(
        senderWallet.id,
        newSenderBalance,
        trx,
      );

      await this.walletRepository.updateBalance(
        recipientWallet.id,
        newRecipientBalance,
        trx,
      );

      const baseReference = this.generateReference("TRF");

      const senderTransaction = await this.transactionRepository.create(
        {
          wallet_id: senderWallet.id,
          type: "transfer_out",
          amount,
          reference: `${baseReference}-OUT`,
          description: `Transfer to ${recipientUser.name} (${recipientUser.email})`,
          recipient_wallet_id: recipientWallet.id,
          status: "completed",
        },
        trx,
      );

      await this.transactionRepository.create(
        {
          wallet_id: recipientWallet.id,
          type: "transfer_in",
          amount,
          reference: `${baseReference}-IN`,
          description: `Transfer from ${senderUser.name} (${senderUser.email})`,
          recipient_wallet_id: senderWallet.id,
          status: "completed",
        },
        trx,
      );

      const result = {
        senderWallet: updatedSenderWallet,
        transaction: senderTransaction,
      };

      // user_id is the SENDER — they own this idempotency key.
      // The recipient has no relationship to this key.
      if (idempotencyKey) {
        await this.idempotencyRepository.upsert(
          {
            key: idempotencyKey,
            user_id: senderUserId,
            execution_status: "completed",
            response_status: 200,
            response_body: JSON.stringify({
              status: "success",
              message: "Funds transferred successfully",
              data: result,
            }),
          },
          trx,
        );
      }

      return result;
    });
  }

  /***********************************Helper methods************************************************/

  private assertValidAmount(amount: number): void {
    if (typeof amount !== "number" || !Number.isFinite(amount)) {
      throw new BadRequestError("Amount must be a finite number");
    }
    if (amount < MIN_AMOUNT) {
      throw new BadRequestError(`Amount must be at least ${MIN_AMOUNT}`);
    }
    if (amount > MAX_AMOUNT) {
      throw new BadRequestError(`Amount must not exceed ${MAX_AMOUNT}`);
    }
  }

  private generateReference(prefix: string): string {
    return `${prefix}-${Date.now()}-${crypto.randomBytes(8).toString("hex")}`;
  }
}
