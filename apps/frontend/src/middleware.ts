import { defineMiddleware } from 'astro:middleware'
import { getApiApp } from './server/app.ts'

export const onRequest = defineMiddleware(async (context, next) => {
  const url = new URL(context.request.url)
  if (url.pathname.startsWith('/api')) {
    return (await getApiApp()).fetch(context.request)
  }
  return next()
})
