export type TransactionType = 'deposit' | 'withdrawal' | 'transfer_in' | 'transfer_out';
export type TransactionStatus = 'pending' | 'completed' | 'failed';

export interface Transaction {
  id: string;
  wallet_id: string;
  type: TransactionType;
  amount: number;
  reference: string;
  description: string;
  recipient_wallet_id?: string | null;
  status: TransactionStatus;
  created_at: Date;
}
