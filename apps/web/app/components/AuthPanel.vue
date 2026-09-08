<script setup lang="ts">
const { session, pending, refreshSession, signUp, signIn, signOut } = useAuth()
const mode = ref<'sign-in' | 'sign-up'>('sign-in')
const name = ref('')
const email = ref('')
const password = ref('')
const feedback = ref<string | null>(null)

async function submit(): Promise<void> {
  feedback.value = null
  const result =
    mode.value === 'sign-up'
      ? await signUp({ name: name.value, email: email.value, password: password.value })
      : await signIn({ email: email.value, password: password.value })

  feedback.value = result.ok
    ? result.session === null
      ? 'Account created. Check your email to continue.'
      : `Welcome back, ${result.session.user.name}.`
    : result.error.message
}

async function refresh(): Promise<void> {
  const result = await refreshSession()
  feedback.value = result.ok
    ? result.session === null
      ? 'No active session found.'
      : `Signed in as ${result.session.user.email}.`
    : result.error.message
}

async function handleSignOut(): Promise<void> {
  const result = await signOut()
  feedback.value = result.ok ? 'You are signed out.' : result.error.message
}

function toggleMode(): void {
  mode.value = mode.value === 'sign-in' ? 'sign-up' : 'sign-in'
  feedback.value = null
}
</script>

<template>
  <main class="min-h-screen bg-slate-950 px-6 py-12 text-slate-100 sm:px-10 lg:px-16">
    <div class="mx-auto grid max-w-5xl gap-12 lg:grid-cols-[1.05fr_0.95fr] lg:items-center">
      <section class="space-y-8">
        <div
          class="flex items-center gap-3 text-sm font-semibold tracking-[0.24em] text-cyan-300 uppercase"
        >
          <span
            class="grid size-10 place-items-center rounded-xl bg-cyan-300 font-bold tracking-normal text-slate-950"
          >
            C
          </span>
          Cimi workspace
        </div>
        <div class="space-y-5">
          <p class="text-sm font-medium tracking-[0.2em] text-slate-400 uppercase">
            Private analytics, clearly scoped
          </p>
          <h1
            class="max-w-xl text-4xl leading-tight font-semibold tracking-tight text-white sm:text-6xl"
          >
            Your workspace starts with a secure session.
          </h1>
          <p class="max-w-lg text-lg leading-8 text-slate-400">
            Sign in to continue to your Cimi workspace. This screen is wired to the shared
            authentication service and keeps the session in an http-only cookie.
          </p>
        </div>
        <div
          class="grid max-w-lg grid-cols-2 gap-4 border-t border-slate-800 pt-6 text-sm text-slate-400"
        >
          <div>
            <p class="text-2xl font-semibold text-white">1</p>
            <p>session authority</p>
          </div>
          <div>
            <p class="text-2xl font-semibold text-white">0</p>
            <p>tokens stored in the browser</p>
          </div>
        </div>
      </section>

      <section
        class="rounded-3xl border border-slate-800 bg-white p-6 text-slate-950 shadow-2xl shadow-cyan-950/30 sm:p-8"
      >
        <div class="mb-8 space-y-2">
          <p class="text-sm font-medium text-cyan-700">Welcome</p>
          <h2 class="text-2xl font-semibold tracking-tight">
            {{ mode === 'sign-up' ? 'Create your account' : 'Sign in to Cimi' }}
          </h2>
          <p class="text-sm text-slate-500">
            {{
              mode === 'sign-up'
                ? 'Set up your workspace identity.'
                : 'Use your Cimi account credentials.'
            }}
          </p>
        </div>

        <div class="mb-6 rounded-2xl bg-slate-100 px-4 py-3 text-sm" aria-live="polite">
          <template v-if="session.status === 'idle' || session.status === 'loading'">
            <span class="text-slate-500">Checking your session...</span>
          </template>
          <template v-else-if="session.status === 'authenticated'">
            <span class="text-emerald-700">Signed in as {{ session.session.user.email }}.</span>
          </template>
          <template v-else-if="session.status === 'unauthenticated'">
            <span class="text-slate-600">No active session.</span>
          </template>
          <template v-else-if="session.status === 'error'">
            <span class="text-rose-700">{{ session.error.message }}</span>
          </template>
        </div>

        <form class="space-y-5" @submit.prevent="submit">
          <div v-if="mode === 'sign-up'" class="space-y-2">
            <label class="text-sm font-medium" for="name">Name</label>
            <input
              id="name"
              v-model="name"
              class="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 outline-none transition focus:border-cyan-600 focus:ring-4 focus:ring-cyan-100"
              autocomplete="name"
              required
              type="text"
            />
          </div>
          <div class="space-y-2">
            <label class="text-sm font-medium" for="email">Email</label>
            <input
              id="email"
              v-model="email"
              class="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 outline-none transition focus:border-cyan-600 focus:ring-4 focus:ring-cyan-100"
              autocomplete="email"
              required
              type="email"
            />
          </div>
          <div class="space-y-2">
            <label class="text-sm font-medium" for="password">Password</label>
            <input
              id="password"
              v-model="password"
              class="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 outline-none transition focus:border-cyan-600 focus:ring-4 focus:ring-cyan-100"
              autocomplete="current-password"
              minlength="8"
              required
              type="password"
            />
          </div>
          <button
            class="h-11 w-full rounded-xl bg-slate-950 px-4 text-sm font-semibold text-white transition hover:bg-cyan-950 disabled:cursor-not-allowed disabled:opacity-50"
            :disabled="pending"
            type="submit"
          >
            {{ pending ? 'Working...' : mode === 'sign-up' ? 'Create account' : 'Sign in' }}
          </button>
        </form>

        <p v-if="feedback" class="mt-4 text-sm text-slate-600" aria-live="polite">{{ feedback }}</p>

        <div
          class="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-5 text-sm"
        >
          <button
            class="font-medium text-cyan-700 hover:text-cyan-950"
            type="button"
            @click="toggleMode"
          >
            {{ mode === 'sign-up' ? 'Already have an account?' : 'Need an account?' }}
          </button>
          <div class="flex gap-3">
            <button
              class="text-slate-500 hover:text-slate-950"
              :disabled="pending"
              type="button"
              @click="refresh"
            >
              Refresh
            </button>
            <button
              v-if="session.status === 'authenticated'"
              class="text-slate-500 hover:text-slate-950"
              :disabled="pending"
              type="button"
              @click="handleSignOut"
            >
              Sign out
            </button>
          </div>
        </div>
      </section>
    </div>
  </main>
</template>
