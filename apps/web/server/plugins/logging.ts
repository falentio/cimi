import { parseLoggingConfig } from '@cimi/config/logging'
import type { LoggingConfig } from '@cimi/logging/level'
import { configureNodeLogging } from '@cimi/logging/node'

export default defineNitroPlugin(() => {
  // SAFETY: nitro-serialized runtime config built by loadLoggingConfig; parseLoggingConfig validates or throws.
  const logging = useRuntimeConfig().public.logging as LoggingConfig
  configureNodeLogging(parseLoggingConfig(logging))
})
