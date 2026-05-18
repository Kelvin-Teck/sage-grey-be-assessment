import crypto from "crypto";
import Decimal from "decimal.js";
import { db } from "../config/database";
import { WalletRepository } from "../repositories/wallet.repository";
import { TransactionRepository } from "../repositories/transaction.repository";
import { UserRepository } from "../repositories/user.repository";
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

// ─── Business rule constants ────────────────────────────────────────────────
// Centralise all monetary limits here so they're easy to audit and change.

/** Smallest allowed operation amount (in your base currency unit, e.g. Naira) */
const MIN_AMOUNT = 0.01;

/**
 * Hard ceiling on a single operation.
 * Adjust to match your actual regulatory / business limits.
 * Having this here prevents someone sending amount: 1e308 which is a valid
 * JS number but would silently corrupt any downstream numeric field.
 */
const MAX_AMOUNT = 10_000_000;

/** Maximum transaction rows returned per page */
const MAX_PAGE_LIMIT = 100;

// ────────────────────────────────────────────────────────────────────────────

export class WalletService {
  private walletRepository = new WalletRepository();
  private transactionRepository = new TransactionRepository();
  private userRepository = new UserRepository();

  // ── getWallet ─────────────────────────────────────────────────────────────

  async getWallet(
    userId: string,
    page = 1,
    limit = 20,
  ): Promise<GetWalletResult> {
    // Clamp limit so a caller can't request an unlimited number of rows
    const safeLimit = Math.min(limit, MAX_PAGE_LIMIT);
    const offset = (page - 1) * safeLimit;

    const wallet = await this.walletRepository.findByUserId(userId);
    if (!wallet) {
      throw new NotFoundError("Wallet not found");
    }

    // Pass pagination params through so the repo query uses LIMIT/OFFSET.
    // Previously the service called findByWalletId(wallet.id) with no args,
    // meaning the repo's limit/offset parameters were dead code.
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
  ): Promise<{ wallet: Wallet; transaction: Transaction }> {
    // Validate amount with explicit bounds before touching the DB.
    this.assertValidAmount(amount);

    return db.transaction(async (trx) => {
      // Lock the row immediately
      const wallet = await this.walletRepository.findByUserId(
        userId,
        trx,
        true,
      );
      if (!wallet) {
        throw new NotFoundError("Wallet not found");
      }

      // Use Decimal arithmetic to avoid IEEE-754 floating-point rounding errors.
      // Example of the bug we're preventing: 0.1 + 0.2 === 0.30000000000000004
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

      return { wallet: updatedWallet, transaction };
    });
  }

  // ── withdraw ──────────────────────────────────────────────────────────────

  async withdraw(
    userId: string,
    amount: number,
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

      // Use Decimal for comparison as well, so we don't compare numbers that
      // have already drifted due to prior floating-point operations.
      if (new Decimal(wallet.balance).lessThan(amount)) {
        throw new BadRequestError("Insufficient wallet balance");
      }

      const newBalance = new Decimal(wallet.balance).minus(amount).toNumber();

      // Extra safety net: the service should never instruct the repo to write
      // a negative balance, even if the subtraction logic above had a bug.
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

      return { wallet: updatedWallet, transaction };
    });
  }

  // ── transfer ──────────────────────────────────────────────────────────────

  async transfer(
    senderUserId: string,
    recipientIdentifier: string,
    amount: number,
  ): Promise<TransferResult> {
    this.assertValidAmount(amount);

    return db.transaction(async (trx) => {
      // ── Resolve users ──────────────────────────────────────────────────

      const senderUser = await this.userRepository.findById(senderUserId, trx);
      if (!senderUser) throw new NotFoundError("Sender user not found");

      // Try email first, then fall back to UUID lookup.
      // Both lookups happen inside the transaction so we get a consistent
      // snapshot of the users table.
      const isUuid =
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
          recipientIdentifier,
        );

      const recipientUser =
        (await this.userRepository.findByEmail(recipientIdentifier, trx)) ??
        (isUuid
          ? await this.userRepository.findById(recipientIdentifier, trx)
          : undefined);

      if (!recipientUser) {
        throw new NotFoundError("Recipient user not found");
      }

      if (senderUser.id === recipientUser.id) {
        throw new BadRequestError("Cannot transfer funds to your own wallet");
      }

      // ── Acquire locks in a deterministic order ─────────────────────────

      // First we need the wallet IDs without locking, just to sort them.
      const [senderWalletRef, recipientWalletRef] = await Promise.all([
        this.walletRepository.findByUserId(senderUser.id, trx),
        this.walletRepository.findByUserId(recipientUser.id, trx),
      ]);

      if (!senderWalletRef || !recipientWalletRef) {
        throw new NotFoundError("One or both wallets not found");
      }

      // Sort IDs to guarantee a consistent locking order across all concurrent
      // transfers, regardless of which direction the transfer goes.
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

      // ── Update balances using Decimal arithmetic ───────────────────────

      const newSenderBalance = new Decimal(senderWallet.balance)
        .minus(amount)
        .toNumber();

      const newRecipientBalance = new Decimal(recipientWallet.balance)
        .plus(amount)
        .toNumber();

      // Sanity guard — should never fire, but protects against logic regressions
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

      // ── Create transaction records ─────────────────────────────────────

      const baseReference = this.generateReference("TRF");

      const senderTransaction = await this.transactionRepository.create(
        {
          wallet_id: senderWallet.id,
          type: "transfer_out",
          amount,
          reference: `${baseReference}-OUT`,
          description: `Transfer to ${recipientUser.name} (${recipientUser.email})`,
          recipient_wallet_id: recipientWallet.id, // renamed field
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
          recipient_wallet_id: senderWallet.id, // now correctly named
          status: "completed",
        },
        trx,
      );

      return {
        senderWallet: updatedSenderWallet,
        transaction: senderTransaction,
      };
    });
  }

  // **************************************************Private helpers methods************************************************/

  // Centralised amount validation.

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

  // Generates a collision-resistant transaction reference
  private generateReference(prefix: string): string {
    return `${prefix}-${Date.now()}-${crypto.randomBytes(8).toString("hex")}`;
  }
}
