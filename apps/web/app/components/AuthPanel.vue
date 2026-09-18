<script setup lang="ts">
import { computed, nextTick, shallowRef, watch } from 'vue'
import { useForm } from 'vee-validate'
import type { AuthResult, SignInInput, SignUpInput } from '@/composables/useAuth'
import {
  type AuthFeedback,
  type AuthFormValues,
  type AuthMode,
  loginSchema,
  signupSchema,
} from '@/lib/auth-form'
import { useLocalizedValibotSchema } from '@/composables/useLocalizedValibotSchema'
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

type AuthRoute = 'login' | 'signup'

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
  readonly confirmPasswordDescription: string
}

type AuthSubmission =
  | { readonly mode: 'login'; readonly input: SignInInput }
  | { readonly mode: 'signup'; readonly input: SignUpInput }

type AuthFormField = keyof AuthFormValues

const props = defineProps<AuthPanelProps>()
const { pending, signIn, signUp } = useAuth()
const { t } = useI18n()
const route = useRoute()
const feedback = shallowRef<AuthFeedback>(null)

const copyByMode = {
  login: {
    title: 'auth.login.title',
    description: 'auth.login.description',
    submitLabel: 'auth.login.submitLabel',
    pendingLabel: 'auth.login.pendingLabel',
    alternatePrompt: 'auth.login.alternatePrompt',
    alternateLabel: 'auth.login.alternateLabel',
    alternateRoute: 'signup',
    emailDescription: 'auth.login.emailDescription',
    passwordDescription: 'auth.login.passwordDescription',
    confirmPasswordDescription: '',
  },
  signup: {
    title: 'auth.signup.title',
    description: 'auth.signup.description',
    submitLabel: 'auth.signup.submitLabel',
    pendingLabel: 'auth.signup.pendingLabel',
    alternatePrompt: 'auth.signup.alternatePrompt',
    alternateLabel: 'auth.signup.alternateLabel',
    alternateRoute: 'login',
    emailDescription: 'auth.signup.emailDescription',
    passwordDescription: 'auth.signup.passwordDescription',
    confirmPasswordDescription: 'auth.signup.confirmPasswordDescription',
  },
} satisfies Record<AuthMode, AuthCopy>

const fieldOrderByMode = {
  login: ['email', 'password'],
  signup: ['name', 'email', 'password', 'passwordConfirmation'],
} satisfies Record<AuthMode, readonly (keyof AuthFormValues)[]>

const copy = computed(() => copyByMode[props.mode])
const alternateLocation = computed(() => ({
  name: copy.value.alternateRoute,
  query: typeof route.query.redirect === 'string' ? { redirect: route.query.redirect } : undefined,
}))
const validationSchema = useLocalizedValibotSchema(() =>
  props.mode === 'signup' ? signupSchema : loginSchema,
)
const { defineField, errors, handleSubmit, resetForm } = useForm<AuthFormValues>({
  initialValues: { name: '', email: '', password: '', passwordConfirmation: '' },
  validationSchema,
})
const fieldOptions = {
  validateOnBlur: false,
  validateOnChange: false,
  validateOnInput: false,
  validateOnModelUpdate: false,
}
const [name, nameAttrs] = defineField('name', fieldOptions)
const [email, emailAttrs] = defineField('email', fieldOptions)
const [password, passwordAttrs] = defineField('password', fieldOptions)
const [passwordConfirmation, passwordConfirmationAttrs] = defineField(
  'passwordConfirmation',
  fieldOptions,
)

watch(
  () => props.mode,
  () => {
    resetForm()
    feedback.value = null
  },
)

const submit = handleSubmit(
  async (values) => {
    if (pending.value) return

    feedback.value = null
    const submission = createSubmission(values)
    const result =
      submission.mode === 'signup' ? await signUp(submission.input) : await signIn(submission.input)

    feedback.value = feedbackForResult(result, submission.mode)
    await redirectAfterAuthentication(result)
  },
  ({ errors: invalidErrors }) => {
    const firstInvalidField = fieldOrderByMode[props.mode].find(
      (field) => invalidErrors[field] !== undefined,
    )
    if (firstInvalidField !== undefined) focusFirstInvalidField(firstInvalidField)
  },
)

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
      ? { tone: 'success', message: t('auth.feedback.accountCreated') }
      : { tone: 'error', message: t('auth.feedback.signInWithoutSession') }
  }

  return {
    tone: 'success',
    message:
      mode === 'signup'
        ? t('auth.feedback.welcome', { name: result.session.user.name })
        : t('auth.feedback.welcomeBack', { name: result.session.user.name }),
  }
}

function focusFirstInvalidField(field: AuthFormField): void {
  void nextTick(() => {
    document.getElementById(field)?.focus()
  })
}

async function redirectAfterAuthentication(result: AuthResult): Promise<void> {
  if (!result.ok || result.session === null) return

  const redirect = route.query.redirect
  if (typeof redirect !== 'string' || !redirect.startsWith('/') || redirect.startsWith('//')) return

  await navigateTo(redirect)
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
        {{ t('auth.brand') }}
      </div>

      <Card>
        <CardHeader class="text-center">
          <CardTitle>
            <h1 class="text-2xl leading-tight font-semibold tracking-tight text-balance">
              {{ t(copy.title) }}
            </h1>
          </CardTitle>
          <CardDescription>{{ t(copy.description) }}</CardDescription>
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
              <Field v-if="props.mode === 'signup'" :data-invalid="errors.name !== undefined">
                <FieldLabel for="name">{{ t('auth.fields.nameLabel') }}</FieldLabel>
                <Input
                  id="name"
                  v-model="name"
                  v-bind="nameAttrs"
                  autocomplete="name"
                  :aria-describedby="
                    errors.name ? 'name-description name-error' : 'name-description'
                  "
                  :aria-invalid="errors.name !== undefined"
                  :disabled="pending"
                  name="name"
                  type="text"
                />
                <FieldDescription id="name-description">
                  {{ t('auth.fields.nameDescription') }}
                </FieldDescription>
                <FieldError v-if="errors.name" id="name-error">
                  {{ errors.name }}
                </FieldError>
              </Field>

              <Field :data-invalid="errors.email !== undefined">
                <FieldLabel for="email">{{ t('auth.fields.emailLabel') }}</FieldLabel>
                <Input
                  id="email"
                  v-model="email"
                  v-bind="emailAttrs"
                  autocomplete="email"
                  :aria-describedby="
                    errors.email ? 'email-description email-error' : 'email-description'
                  "
                  :aria-invalid="errors.email !== undefined"
                  :disabled="pending"
                  inputmode="email"
                  name="email"
                  type="email"
                />
                <FieldDescription id="email-description">
                  {{ t(copy.emailDescription) }}
                </FieldDescription>
                <FieldError v-if="errors.email" id="email-error">
                  {{ errors.email }}
                </FieldError>
              </Field>

              <Field :data-invalid="errors.password !== undefined">
                <FieldLabel for="password">{{ t('auth.fields.passwordLabel') }}</FieldLabel>
                <Input
                  id="password"
                  v-model="password"
                  v-bind="passwordAttrs"
                  :aria-describedby="
                    errors.password ? 'password-description password-error' : 'password-description'
                  "
                  :aria-invalid="errors.password !== undefined"
                  :autocomplete="props.mode === 'signup' ? 'new-password' : 'current-password'"
                  :disabled="pending"
                  name="password"
                  type="password"
                />
                <FieldDescription id="password-description">
                  {{ t(copy.passwordDescription) }}
                </FieldDescription>
                <FieldError v-if="errors.password" id="password-error">
                  {{ errors.password }}
                </FieldError>
              </Field>

              <Field
                v-if="props.mode === 'signup'"
                :data-invalid="errors.passwordConfirmation !== undefined"
              >
                <FieldLabel for="passwordConfirmation">
                  {{ t('auth.fields.confirmPasswordLabel') }}
                </FieldLabel>
                <Input
                  id="passwordConfirmation"
                  v-model="passwordConfirmation"
                  v-bind="passwordConfirmationAttrs"
                  :aria-describedby="
                    errors.passwordConfirmation
                      ? 'passwordConfirmation-description passwordConfirmation-error'
                      : 'passwordConfirmation-description'
                  "
                  :aria-invalid="errors.passwordConfirmation !== undefined"
                  autocomplete="new-password"
                  :disabled="pending"
                  name="passwordConfirmation"
                  type="password"
                />
                <FieldDescription id="passwordConfirmation-description">
                  {{ t(copy.confirmPasswordDescription) }}
                </FieldDescription>
                <FieldError v-if="errors.passwordConfirmation" id="passwordConfirmation-error">
                  {{ errors.passwordConfirmation }}
                </FieldError>
              </Field>
            </FieldGroup>

            <Button class="w-full" :disabled="pending" size="lg" type="submit">
              <Spinner v-if="pending" data-icon="inline-start" />
              {{ t(pending ? copy.pendingLabel : copy.submitLabel) }}
            </Button>
          </form>
        </CardContent>

        <CardFooter class="justify-center">
          <p class="text-muted-foreground text-center text-sm">
            {{ t(copy.alternatePrompt) }}
            <NuxtLinkLocale
              class="text-primary font-medium underline-offset-4 hover:underline"
              :to="alternateLocation"
            >
              {{ t(copy.alternateLabel) }}
            </NuxtLinkLocale>
          </p>
        </CardFooter>
      </Card>
    </div>
  </main>
</template>
