import { Request, Response, NextFunction } from 'express';
import { IdempotencyRepository } from '../repositories/idempotency.repository';
import { ConflictError, BadRequestError } from '../errors';

export const IdempotencyGuard = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const key = req.headers['x-idempotency-key'] as string | undefined;
    if (!key) {
      if (req.method !== 'GET' && req.method !== 'HEAD' && req.method !== 'OPTIONS') {
        return next(new BadRequestError('X-Idempotency-Key header is strictly required for all financial mutation operations'));
      }
      return next();
    }

    const userId = req.user?.id || req.headers.authorization || 'anonymous';
    const repo = new IdempotencyRepository();
    const existing = await repo.findByKey(key);

    if (existing) {
      if (existing.user_id !== userId) {
        return next(new ConflictError('Idempotency key is already in use by another user'));
      }

      if (existing.execution_status === 'in_progress') {
        return next(new ConflictError('A transaction with this idempotency key is currently in progress'));
      }

      if (existing.execution_status === 'completed' || existing.execution_status === 'failed') {
        const statusCode = existing.response_status || 200;
        let bodyObj = existing.response_body;
        if (typeof existing.response_body === 'string') {
          try { bodyObj = JSON.parse(existing.response_body); } catch (e) {}
        }
        res.status(statusCode).json(bodyObj);
        return;
      }
    }

    await repo.create({ key, user_id: userId, request_path: req.originalUrl });

    const originalJson = res.json.bind(res);
    res.json = (body: any) => {
      const statusCode = res.statusCode || 200;
      const executionStatus = statusCode >= 200 && statusCode < 400 ? 'completed' : 'failed';
      repo.updateResult(key, executionStatus, statusCode, body).catch(() => {});
      return originalJson(body);
    };

    next();
  } catch (err) {
    next(err);
  }
};
