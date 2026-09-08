import { z } from 'zod'

export type AuthMode = 'login' | 'signup'

export interface AuthFormValues {
  name: string
  email: string
  password: string
}

export type AuthFeedback =
  | { tone: 'error'; message: string }
  | { tone: 'success'; message: string }
  | null

const emailSchema = z
  .string()
  .trim()
  .min(1, 'Email is required.')
  .email('Enter a valid email address.')

const passwordSchema = z
  .string()
  .min(1, 'Password is required.')
  .min(8, 'Password must be at least 8 characters.')

export const loginSchema = z.object({
  name: z.string(),
  email: emailSchema,
  password: passwordSchema,
}) satisfies z.ZodType<AuthFormValues>

export const signupSchema = loginSchema.extend({
  name: z.string().trim().min(1, 'Name is required.'),
}) satisfies z.ZodType<AuthFormValues>
