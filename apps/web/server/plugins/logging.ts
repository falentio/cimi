import { configureNodeLogging } from '@cimi/logging/node'

export default defineNitroPlugin(() => {
  configureNodeLogging()
})
