export interface Wallet {
  id: string;
  user_id: string;
  balance: number; // Stored as decimal in DB, mapped to numeric in JS
  currency: string;
  created_at: Date;
  updated_at: Date;
}
