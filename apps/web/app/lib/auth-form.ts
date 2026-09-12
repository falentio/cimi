import * as v from 'valibot'

export type AuthMode = 'login' | 'signup'

export type AuthFeedback =
  | { tone: 'error'; message: string }
  | { tone: 'success'; message: string }
  | null

const emailSchema = v.pipe(
  v.string(),
  v.trim(),
  v.minLength(1, 'Email is required.'),
  v.email('Enter a valid email address.'),
)

const passwordSchema = v.pipe(
  v.string(),
  v.minLength(1, 'Password is required.'),
  v.minLength(8, 'Password must be at least 8 characters.'),
)

export const loginSchema = v.object({
  name: v.string(),
  email: emailSchema,
  password: passwordSchema,
})

export type LoginFormValues = v.InferOutput<typeof loginSchema>

export const signupSchema = v.pipe(
  v.object({
    name: v.pipe(v.string(), v.trim(), v.minLength(1, 'Name is required.')),
    email: emailSchema,
    password: passwordSchema,
    passwordConfirmation: v.pipe(v.string(), v.minLength(1, 'Password confirmation is required.')),
  }),
  v.forward(
    v.partialCheck(
      [['password'], ['passwordConfirmation']],
      (input) => input.password === input.passwordConfirmation,
      'Passwords do not match.',
    ),
    ['passwordConfirmation'],
  ),
)

export type SignupFormValues = v.InferOutput<typeof signupSchema>

export type AuthFormValues = SignupFormValues
