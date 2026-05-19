import { Request, Response, NextFunction } from "express";
import { IdempotencyRepository } from "../repositories/idempotency.repository";
import { ConflictError, BadRequestError, UnauthorizedError } from "../errors";
import { logger } from "../utils/logger";

const repo = new IdempotencyRepository();

// Valid idempotency key: alphanumeric, hyphens, underscores, 5-100 chars
const IDEMPOTENCY_KEY_REGEX = /^[a-zA-Z0-9_-]{5,100}$/;

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

export const IdempotencyGuard = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    // Safe methods don't mutate state — idempotency key not required
    if (SAFE_METHODS.has(req.method)) return next();

    const key = req.headers["x-idempotency-key"] as string | undefined;
    if (!key) {
      return next(
        new BadRequestError(
          "X-Idempotency-Key header is required for all financial operations",
        ),
      );
    }

    if (!IDEMPOTENCY_KEY_REGEX.test(key)) {
      return next(
        new BadRequestError(
          "X-Idempotency-Key must be alphanumeric (hyphens/underscores allowed), 5-100 characters",
        ),
      );
    }

    if (!req.user?.id) {
      return next(new UnauthorizedError("Authenticated user required"));
    }

    const userId = req.user.id;
    // Scope the key: userId + method + path + raw key → unique per user & operation
    const scopedKey = `${userId}:${req.method}:${req.path}:${key}`;

    // tryInsertInProgress issues a single atomic "INSERT … ON CONFLICT DO NOTHING"
    // RETURNING statement. Exactly one concurrent request wins the insert; all
    // others get false and must inspect the existing record below.
    const inserted = await repo.tryInsertInProgress(scopedKey, userId, req.path);

    if (!inserted) {
      // A record already exists — check its status
      const existing = await repo.findByKey(scopedKey);

      if (!existing) {
        // Extremely unlikely edge-case (row deleted between the two calls).
        // Fall through and let the service layer handle it via upsert.
        req.idempotencyKey = scopedKey;
        return next();
      }

      if (existing.execution_status === "in_progress") {
        // Either currently being processed, or stuck from a previous crash.
        logger.warn(
          `Idempotency key ${scopedKey} is in_progress — allowing retry`,
        );
        // Allow retry: the service's upsert will overwrite the stale record.
        req.idempotencyKey = scopedKey;
        return next();
      }

      // completed or failed — return the cached response
      const statusCode = existing.response_status ?? 200;
      let body: any = existing.response_body;
      if (typeof body === "string") {
        try {
          body = JSON.parse(body);
        } catch (_) {}
      }
      res.status(statusCode).json(body);
      return;
    }

    // Insert succeeded — this is a genuinely new key; proceed to service
    req.idempotencyKey = scopedKey;
    next();
  } catch (err) {
    next(err);
  }
};
