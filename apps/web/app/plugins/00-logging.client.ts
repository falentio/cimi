import { parseLoggingConfig } from '@cimi/config/logging'
import { configureBrowserLogging } from '@cimi/logging'

export default defineNuxtPlugin(() => {
  configureBrowserLogging(parseLoggingConfig(useRuntimeConfig().public.logging))
})
