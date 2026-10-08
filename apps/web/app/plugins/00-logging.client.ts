import { parseLoggingConfig } from '@cimi/config/logging'
import { configureBrowserLogging } from '@cimi/logging'
import type { LoggingConfig } from '@cimi/logging/level'

export default defineNuxtPlugin(() => {
  // SAFETY: nitro-serialized runtime config built by loadLoggingConfig; parseLoggingConfig validates or throws.
  const logging = useRuntimeConfig().public.logging as LoggingConfig
  configureBrowserLogging(parseLoggingConfig(logging))
})
