<script setup lang="ts">
import { computed, nextTick, reactive, shallowRef, watch } from 'vue'
import type { AuthResult, SignInInput, SignUpInput } from '@/composables/useAuth'
import {
  type AuthFeedback,
  type AuthFormValues,
  type AuthMode,
  loginSchema,
  signupSchema,
} from '@/lib/auth-form'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Spinner } from '@/components/ui/spinner'

interface AuthPanelProps {
  readonly mode: AuthMode
}

type AuthRoute = '/login' | '/signup'

interface AuthCopy {
  readonly title: string
  readonly description: string
  readonly submitLabel: string
  readonly pendingLabel: string
  readonly alternatePrompt: string
  readonly alternateLabel: string
  readonly alternateRoute: AuthRoute
  readonly emailDescription: string
  readonly passwordDescription: string
}

type AuthSubmission =
  | { readonly mode: 'login'; readonly input: SignInInput }
  | { readonly mode: 'signup'; readonly input: SignUpInput }

type AuthFormField = keyof AuthFormValues
type AuthFieldErrors = Partial<Record<AuthFormField, string>>

const props = defineProps<AuthPanelProps>()
const { pending, signIn, signUp } = useAuth()
const feedback = shallowRef<AuthFeedback>(null)
const form = reactive<AuthFormValues>({ name: '', email: '', password: '' })
const fieldErrors = shallowRef<AuthFieldErrors>({})

const copyByMode = {
  login: {
    title: 'Welcome back',
    description: 'Sign in to your Cimi workspace.',
    submitLabel: 'Sign in',
    pendingLabel: 'Signing in...',
    alternatePrompt: 'Need an account?',
    alternateLabel: 'Sign up',
    alternateRoute: '/signup',
    emailDescription: 'Use the email address associated with your Cimi account.',
    passwordDescription: 'Use the password for your Cimi account.',
  },
  signup: {
    title: 'Create your account',
    description: 'Start with a secure Cimi workspace.',
    submitLabel: 'Create account',
    pendingLabel: 'Creating account...',
    alternatePrompt: 'Already have an account?',
    alternateLabel: 'Log in',
    alternateRoute: '/login',
    emailDescription: 'We will use this address for account verification.',
    passwordDescription: 'Choose a password with at least 8 characters.',
  },
} satisfies Record<AuthMode, AuthCopy>

const fieldOrderByMode = {
  login: ['email', 'password'],
  signup: ['name', 'email', 'password'],
} satisfies Record<AuthMode, readonly (keyof AuthFormValues)[]>

const copy = computed(() => copyByMode[props.mode])
watch(
  () => props.mode,
  () => {
    form.name = ''
    form.email = ''
    form.password = ''
    fieldErrors.value = {}
    feedback.value = null
  },
)

async function submit(): Promise<void> {
  if (pending.value) return

  const schema = props.mode === 'signup' ? signupSchema : loginSchema
  const parsed = schema.safeParse(form)
  if (!parsed.success) {
    const nextErrors: AuthFieldErrors = {}
    for (const issue of parsed.error.issues) {
      const field = issue.path[0]
      if (
        (field === 'name' || field === 'email' || field === 'password') &&
        nextErrors[field] === undefined
      ) {
        nextErrors[field] = issue.message
      }
    }
    fieldErrors.value = nextErrors
    const firstInvalidField = fieldOrderByMode[props.mode].find(
      (field) => nextErrors[field] !== undefined,
    )
    if (firstInvalidField !== undefined) focusFirstInvalidField(firstInvalidField)
    return
  }

  fieldErrors.value = {}
  feedback.value = null
  const submission = createSubmission(parsed.data)
  const result =
    submission.mode === 'signup' ? await signUp(submission.input) : await signIn(submission.input)

  feedback.value = feedbackForResult(result, submission.mode)
}

function createSubmission(values: AuthFormValues): AuthSubmission {
  if (props.mode === 'signup') {
    return {
      mode: 'signup',
      input: {
        name: values.name,
        email: values.email,
        password: values.password,
      },
    }
  }

  return {
    mode: 'login',
    input: {
      email: values.email,
      password: values.password,
    },
  }
}

function feedbackForResult(result: AuthResult, mode: AuthMode): AuthFeedback {
  if (!result.ok) {
    return { tone: 'error', message: result.error.message }
  }

  if (result.session === null) {
    return mode === 'signup'
      ? { tone: 'success', message: 'Account created. Check your email to continue.' }
      : { tone: 'error', message: 'Sign-in succeeded, but no active session was returned.' }
  }

  return {
    tone: 'success',
    message:
      mode === 'signup'
        ? `Welcome to Cimi, ${result.session.user.name}.`
        : `Welcome back, ${result.session.user.name}.`,
  }
}

function focusFirstInvalidField(field: AuthFormField): void {
  void nextTick(() => {
    document.getElementById(field)?.focus()
  })
}
</script>

<template>
  <main class="bg-muted flex min-h-svh flex-col items-center justify-center gap-6 p-6 md:p-10">
    <div class="flex w-full max-w-sm flex-col gap-6">
      <div class="flex items-center gap-2 self-center font-medium">
        <span
          aria-hidden="true"
          class="bg-primary text-primary-foreground flex size-6 items-center justify-center rounded-md text-xs font-semibold"
        >
          C
        </span>
        Cimi workspace
      </div>

      <Card>
        <CardHeader class="text-center">
          <CardTitle>
            <h1 class="text-2xl leading-tight font-semibold tracking-tight text-balance">
              {{ copy.title }}
            </h1>
          </CardTitle>
          <CardDescription>{{ copy.description }}</CardDescription>
        </CardHeader>

        <CardContent class="flex flex-col gap-6">
          <Alert v-if="feedback" :variant="feedback.tone === 'error' ? 'destructive' : 'default'">
            <AlertDescription>{{ feedback.message }}</AlertDescription>
          </Alert>

          <form
            class="flex flex-col gap-6"
            novalidate
            :aria-busy="pending"
            @submit.prevent="submit"
          >
            <FieldGroup class="gap-4">
              <Field v-if="props.mode === 'signup'" :data-invalid="fieldErrors.name !== undefined">
                <FieldLabel for="name">Name</FieldLabel>
                <Input
                  id="name"
                  v-model="form.name"
                  autocomplete="name"
                  :aria-describedby="
                    fieldErrors.name ? 'name-description name-error' : 'name-description'
                  "
                  :aria-invalid="fieldErrors.name !== undefined"
                  :disabled="pending"
                  name="name"
                  type="text"
                />
                <FieldDescription id="name-description">
                  Enter the name for your Cimi workspace.
                </FieldDescription>
                <FieldError v-if="fieldErrors.name" id="name-error">
                  {{ fieldErrors.name }}
                </FieldError>
              </Field>

              <Field :data-invalid="fieldErrors.email !== undefined">
                <FieldLabel for="email">Email</FieldLabel>
                <Input
                  id="email"
                  v-model="form.email"
                  autocomplete="email"
                  :aria-describedby="
                    fieldErrors.email ? 'email-description email-error' : 'email-description'
                  "
                  :aria-invalid="fieldErrors.email !== undefined"
                  :disabled="pending"
                  inputmode="email"
                  name="email"
                  type="email"
                />
                <FieldDescription id="email-description">
                  {{ copy.emailDescription }}
                </FieldDescription>
                <FieldError v-if="fieldErrors.email" id="email-error">
                  {{ fieldErrors.email }}
                </FieldError>
              </Field>

              <Field :data-invalid="fieldErrors.password !== undefined">
                <FieldLabel for="password">Password</FieldLabel>
                <Input
                  id="password"
                  v-model="form.password"
                  :aria-describedby="
                    fieldErrors.password
                      ? 'password-description password-error'
                      : 'password-description'
                  "
                  :aria-invalid="fieldErrors.password !== undefined"
                  :autocomplete="props.mode === 'signup' ? 'new-password' : 'current-password'"
                  :disabled="pending"
                  name="password"
                  type="password"
                />
                <FieldDescription id="password-description">
                  {{ copy.passwordDescription }}
                </FieldDescription>
                <FieldError v-if="fieldErrors.password" id="password-error">
                  {{ fieldErrors.password }}
                </FieldError>
              </Field>
            </FieldGroup>

            <Button class="w-full" :disabled="pending" size="lg" type="submit">
              <Spinner v-if="pending" data-icon="inline-start" />
              {{ pending ? copy.pendingLabel : copy.submitLabel }}
            </Button>
          </form>
        </CardContent>

        <CardFooter class="justify-center">
          <p class="text-muted-foreground text-center text-sm">
            {{ copy.alternatePrompt }}
            <NuxtLink
              class="text-primary font-medium underline-offset-4 hover:underline"
              :to="copy.alternateRoute"
            >
              {{ copy.alternateLabel }}
            </NuxtLink>
          </p>
        </CardFooter>
      </Card>
    </div>
  </main>
</template>
