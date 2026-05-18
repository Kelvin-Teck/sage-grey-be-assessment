import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../config/env';
import { UserRepository } from '../repositories/user.repository';
import { TokenBlacklistRepository } from '../repositories/token-blacklist.repository';
import { UnauthorizedError, InternalServerError } from '../errors';

export const AuthGuard = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return next(new UnauthorizedError('Unauthorized: Missing or invalid authorization token'));
    }

    const token = authHeader.split(' ')[1];

    const tokenBlacklistRepo = new TokenBlacklistRepository();
    const isBlacklisted = await tokenBlacklistRepo.isBlacklisted(token);
    if (isBlacklisted) {
      return next(new UnauthorizedError('Unauthorized: Token has been logged out or invalidated'));
    }

    try {
      const decoded = jwt.verify(token, env.JWT_SECRET) as { userId: string };
      const userRepository = new UserRepository();
      const user = await userRepository.findById(decoded.userId);

      if (!user) {
        return next(new UnauthorizedError('Unauthorized: User associated with token no longer exists'));
      }

      req.user = user;
      return next();
    } catch (err) {
      return next(new UnauthorizedError('Unauthorized: Invalid token'));
    }
  } catch (error) {
    return next(new InternalServerError('Internal server error during authentication'));
  }
};
