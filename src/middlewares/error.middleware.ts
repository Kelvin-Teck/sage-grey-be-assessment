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
  // Always log the full error detail server-side
  logger.error(`[Error Handler] ${err.message}`, { stack: err.stack });

  if (err instanceof AppError) {
    // honour the isOperational flag — non-operational errors indicate
    // programming bugs and should not expose internal details to clients.
    if (!err.isOperational) {
      sendError(res, 500, 'Internal Server Error');
      return;
    }

    // M6: 5xx errors return a generic message to the client regardless of
    // the actual internal detail (which was already logged above).
    const clientMessage = err.statusCode >= 500
      ? 'Internal Server Error'
      : err.message;

    sendError(res, err.statusCode, clientMessage, err.statusCode < 500 ? err.errors : undefined);
    return;
  }

  // Handle Knex unique-constraint violations
  if ((err as any).code === '23505') {
    sendError(res, 409, 'Duplicate record entry');
    return;
  }

  // Unknown / unhandled errors
  const detail = process.env.NODE_ENV === 'development' ? err.message : undefined;
  sendError(res, 500, 'Internal Server Error', detail);
};
