import { getWebApiApp } from '../utils/api-app'

export default defineEventHandler(async (event) => {
  const app = await getWebApiApp()
  return app.fetch(toWebRequest(event))
})
