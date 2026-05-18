import { z } from 'zod';

export const amountSchema = z.object({
  body: z.object({
    amount: z.number().positive('Amount must be a positive number').max(10_000_000, 'Amount cannot exceed 10,000,000'),
  }),
});

export const transferSchema = z.object({
  body: z.object({
    recipient: z.union([
      z.string().email(),
      z.string().uuid()
    ], { errorMap: () => ({ message: 'Recipient must be a valid email address or user UUID' }) }),
    amount: z.number().positive('Transfer amount must be a positive number').max(10_000_000, 'Transfer amount cannot exceed 10,000,000'),
  }),
});

export type AmountInput = z.infer<typeof amountSchema>;
export type TransferInput = z.infer<typeof transferSchema>;
