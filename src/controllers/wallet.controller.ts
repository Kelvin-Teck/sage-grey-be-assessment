import { Request, Response, NextFunction } from 'express';
import { WalletService } from '../services/wallet.service';
import { sendSuccess } from '../utils/response';

export class WalletController {
  private walletService = new WalletService();

  constructor() {
    this.getWallet = this.getWallet.bind(this);
    this.fund = this.fund.bind(this);
    this.withdraw = this.withdraw.bind(this);
    this.transfer = this.transfer.bind(this);
  }

  async getWallet(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const pageNum = req.query.page ? parseInt(req.query.page as string, 10) : 1;
      const limitNum = req.query.limit ? parseInt(req.query.limit as string, 10) : 20;
      const result = await this.walletService.getWallet(
        req.user!.id,
        isNaN(pageNum) ? 1 : pageNum,
        isNaN(limitNum) ? 20 : limitNum
      );
      sendSuccess(res, 200, 'Wallet details and transaction history retrieved', result);
    } catch (error) {
      next(error);
    }
  }

  async fund(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { amount } = req.body;
      const result = await this.walletService.fund(req.user!.id, amount, req.idempotencyKey);
      sendSuccess(res, 200, 'Account funded successfully', result);
    } catch (error) {
      next(error);
    }
  }

  async withdraw(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { amount } = req.body;
      const result = await this.walletService.withdraw(req.user!.id, amount, req.idempotencyKey);
      sendSuccess(res, 200, 'Funds withdrawn successfully', result);
    } catch (error) {
      next(error);
    }
  }

  async transfer(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { recipient, amount } = req.body;
      const result = await this.walletService.transfer(req.user!.id, recipient, amount, req.idempotencyKey);
      sendSuccess(res, 200, 'Funds transferred successfully', result);
    } catch (error) {
      next(error);
    }
  }
}
