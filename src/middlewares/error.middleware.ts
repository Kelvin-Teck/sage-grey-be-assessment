import { Request, Response, NextFunction } from 'express';
import { sendError } from '../utils/response';
import { AppError } from '../errors';
import { logger } from '../utils/logger';

export const errorHandler = (
  err: Error,
  req: Request,
  res: Response,
  next: NextFunction,
): void => {
  logger.error(`[Error Handler] ${err.message}`, { stack: err.stack });

  if (err instanceof AppError) {
    sendError(res, err.statusCode, err.message, err.errors);
    return;
  }

  // Handle Knex database errors
  if ((err as any).code === '23505') {
    sendError(res, 400, 'Duplicate record entry error');
    return;
  }

  sendError(res, 500, 'Internal Server Error', process.env.NODE_ENV === 'development' ? err.message : undefined);
  return;
};
