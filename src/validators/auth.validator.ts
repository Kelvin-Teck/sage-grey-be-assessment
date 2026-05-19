import { z } from 'zod';

export const registerSchema = z.object({
  body: z.object({
    email: z.string().email('Please provide a valid email address'),
    name: z.string().min(2, 'Name must be at least 2 characters long'),
    password: z.string()
      .min(8, 'Password must be at least 8 characters long')
      .max(72, 'Password cannot exceed 72 characters'),
  }),
});

export const loginSchema = z.object({
  body: z.object({
    email: z.string().email('Please provide a valid email address'),
    password: z.string().min(1, 'Password is required'),
  }),
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
