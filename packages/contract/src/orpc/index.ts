import { oc as baseOc } from '@orpc/contract'
import type { AuthMeta } from './meta.ts'
import { ERROR_CATALOG, type ContractErrorCode } from '../schema/errors.ts'

type Builder = ReturnType<typeof baseOc.$meta<AuthMeta>>

export const oc = wrapBuilder(baseOc.$meta<AuthMeta>({ devOnly: false })) as Builder

function wrapBuilder<T extends object>(builder: T): T {
  return new Proxy(builder, {
    get(target, property) {
      const value = Reflect.get(target, property, target)
      if (typeof value !== 'function') return value

      return (...args: unknown[]) => {
        const nextArgs =
          property === 'errors'
            ? [withCentralErrorMessages(args[0] as Record<string, unknown>)]
            : args
        const result = Reflect.apply(value, target, nextArgs)
        return result !== null && typeof result === 'object' ? wrapBuilder(result) : result
      }
    },
  })
}

function withCentralErrorMessages(errors: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(errors).map(([code, definition]) => {
      const catalogDefinition = ERROR_CATALOG[code as ContractErrorCode]
      if (catalogDefinition === undefined) {
        throw new TypeError(`Unknown contract error code: ${code}`)
      }
      if (definition === null || typeof definition !== 'object') {
        throw new TypeError(`Contract error ${code} must use an object definition`)
      }

      const callerDefinition = definition as { status?: unknown; message?: unknown }
      if ('status' in callerDefinition) {
        throw new TypeError(`Contract error ${code} must not define catalog status`)
      }
      if ('message' in callerDefinition) {
        throw new TypeError(`Contract error ${code} must not define catalog message`)
      }

      return [
        code,
        {
          ...definition,
          status: catalogDefinition.status,
          message: catalogDefinition.message,
        },
      ]
    }),
  )
}
