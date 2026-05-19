import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { db } from '../config/database';
import { env } from '../config/env';
import { UserRepository } from '../repositories/user.repository';
import { WalletRepository } from '../repositories/wallet.repository';
import { TokenBlacklistRepository } from '../repositories/token-blacklist.repository';
import { ConflictError, UnauthorizedError, InternalServerError } from '../errors';

export interface AuthResponse {
  user: {
    id: string;
    email: string;
    name: string;
  };
  token: string;
  wallet: {
    id: string;
    balance: number;
    currency: string;
  };
}

export class AuthService {
  private userRepository = new UserRepository();
  private walletRepository = new WalletRepository();
  private tokenBlacklistRepository = new TokenBlacklistRepository();

  async register(email: string, name: string, passwordPlain: string): Promise<AuthResponse> {
    const existingUser = await this.userRepository.findByEmail(email);
    
    if (existingUser) {
      throw new ConflictError('User with this email already exists');
    }

    const password = await this.hashPassword(passwordPlain);

    // Use transaction to ensure user and wallet are created together
    return db.transaction(async (trx) => {
      const user = await this.userRepository.create(
        { email, name, password },
        trx,
      );

      const wallet = await this.walletRepository.create(
        { user_id: user.id, balance: 0.0, currency: 'NGN' },
        trx,
      );

      const token = this.generateAccessToken(user.id, user.email, user.name);

      return {
        user: { id: user.id, email: user.email, name: user.name },
        token,
        wallet: { id: wallet.id, balance: wallet.balance, currency: wallet.currency },
      };
    });
  }

  async login(email: string, passwordPlain: string): Promise<AuthResponse> {
    const user = await this.userRepository.findByEmail(email);
    if (!user) {
      throw new UnauthorizedError('Invalid email or password');
    }

    const isMatch = await this.comparePassword(passwordPlain, user.password);
    if (!isMatch) {
      throw new UnauthorizedError('Invalid email or password');
    }

    const wallet = await this.walletRepository.findByUserId(user.id);
    if (!wallet) {
      throw new InternalServerError('Wallet not found for user');
    }

    const token = this.generateAccessToken(user.id, user.email, user.name);

    return {
      user: { id: user.id, email: user.email, name: user.name },
      token,
      wallet: { id: wallet.id, balance: wallet.balance, currency: wallet.currency },
    };
  }

  async logout(token: string): Promise<void> {
    try {
      const decoded = jwt.decode(token) as { exp?: number } | null;
      const expiresAt = decoded?.exp
        ? new Date(decoded.exp * 1000)
        : new Date(Date.now() + 24 * 60 * 60 * 1000);
      
      const tokenHash = TokenBlacklistRepository.hashToken(token);

      await this.tokenBlacklistRepository.blacklist(tokenHash, expiresAt);

    } catch (err) {
      // Ignore decoding failures — malformed tokens can't be blacklisted
    }
  }

  /***************************Helper methods****************************************/


  private generateAccessToken(userId: string, email: string, name: string): string {
    return jwt.sign({ userId, email, name }, env.JWT_SECRET, {
      expiresIn: env.JWT_EXPIRES_IN as any,
    });
  }


  private async hashPassword(password: string): Promise<string> {
    return await bcrypt.hash(password, env.BCRYPT_ROUNDS);
  }
  
  private async comparePassword(passwordPlain: string, passwordHash: string): Promise<boolean> {
    return await bcrypt.compare(passwordPlain, passwordHash);
  }
}
