
export interface SafeUser {
  id: string;
  email: string;
  name: string;
}

declare global {
  namespace Express {
    interface Request {
      user?: SafeUser;
      idempotencyKey?: string;
    }
  }
}
