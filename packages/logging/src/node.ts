import { AsyncLocalStorage } from 'node:async_hooks'
import { configureSync } from '@logtape/logtape'
import { createLoggingConfiguration } from './index.ts'

let configured = false

export function configureNodeLogging(): void {
  if (configured) return

  configureSync({
    ...createLoggingConfiguration(),
    contextLocalStorage: new AsyncLocalStorage<Record<string, unknown>>(),
  })
  configured = true
}
