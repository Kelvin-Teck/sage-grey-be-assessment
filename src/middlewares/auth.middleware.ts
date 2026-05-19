import crypto from 'crypto';
import { Request, Response, NextFunction } from 'express';
import jwt, { TokenExpiredError } from 'jsonwebtoken';
import { env } from '../config/env';
import { TokenBlacklistRepository } from '../repositories/token-blacklist.repository';
import { UnauthorizedError, InternalServerError } from '../errors';
import { logger } from '../utils/logger';

const tokenBlacklistRepo = new TokenBlacklistRepository();

export const AuthGuard = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return next(new UnauthorizedError('Unauthorized: Missing or invalid authorization token'));
    }

    const token = authHeader.split(' ')[1];

    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    const isBlacklisted = await tokenBlacklistRepo.isBlacklisted(tokenHash);
    if (isBlacklisted) {
      return next(new UnauthorizedError('Unauthorized: Token has been logged out or invalidated'));
    }

    try {
      const decoded = jwt.verify(token, env.JWT_SECRET) as {
        userId: string;
        email: string;
        name: string;
      };

      req.user = { id: decoded.userId, email: decoded.email, name: decoded.name };
      return next();
    } catch (err) {
      if (err instanceof TokenExpiredError) {
        return next(new UnauthorizedError('Unauthorized: Token has expired'));
      }
      return next(new UnauthorizedError('Unauthorized: Invalid token'));
    }
  } catch (error) {
    logger.error('[AuthGuard] Unexpected error during authentication:', error);
    return next(new InternalServerError('Internal server error during authentication'));
  }
};
