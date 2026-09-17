import { closeWebApiApp } from '../utils/api-app'

export default defineNitroPlugin((nitroApp) => {
  nitroApp.hooks.hook('close', () => closeWebApiApp())
})
