import * as v from 'valibot'

export type AuthMode = 'login' | 'signup'

export type AuthFeedbackMessageKey =
  | 'auth.feedback.accountCreated'
  | 'auth.feedback.signInWithoutSession'
  | 'auth.feedback.welcome'
  | 'auth.feedback.welcomeBack'

export type AuthFeedback =
  | { tone: 'error'; code?: string; message: string }
  | {
      tone: 'error' | 'success'
      messageKey: AuthFeedbackMessageKey
      values?: { name: string }
    }
  | null

const emailSchema = v.pipe(
  v.string(),
  v.trim(),
  v.minLength(1, 'validation.auth.email.required'),
  v.email('validation.auth.email.invalid'),
)

const passwordSchema = v.pipe(
  v.string(),
  v.minLength(1, 'validation.auth.password.required'),
  v.minLength(8, 'validation.auth.password.minLength'),
)

export const loginSchema = v.object({
  name: v.string(),
  email: emailSchema,
  password: passwordSchema,
})

export type LoginFormValues = v.InferOutput<typeof loginSchema>

export const signupSchema = v.pipe(
  v.object({
    name: v.pipe(v.string(), v.trim(), v.minLength(1, 'validation.auth.name.required')),
    email: emailSchema,
    password: passwordSchema,
    passwordConfirmation: v.pipe(
      v.string(),
      v.minLength(1, 'validation.auth.passwordConfirmation.required'),
    ),
  }),
  v.forward(
    v.partialCheck(
      [['password'], ['passwordConfirmation']],
      (input) => input.password === input.passwordConfirmation,
      'validation.auth.passwordConfirmation.mismatch',
    ),
    ['passwordConfirmation'],
  ),
)

export type SignupFormValues = v.InferOutput<typeof signupSchema>

export type AuthFormValues = SignupFormValues
