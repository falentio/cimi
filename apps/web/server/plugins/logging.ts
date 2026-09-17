import { parseLoggingConfig } from '@cimi/config/logging'
import { configureNodeLogging } from '@cimi/logging/node'

export default defineNitroPlugin(() => {
  configureNodeLogging(parseLoggingConfig(useRuntimeConfig().public.logging))
})
