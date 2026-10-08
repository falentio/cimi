import { oc as baseOc } from '@orpc/contract'
import { isFunctionValue, isRecord, type JsonValue } from '@cimi/utils'
import type { AuthMeta } from './meta.ts'
import { ERROR_CATALOG, type ContractErrorCode } from '../schema/errors.ts'

/** Non-null object test preserving arrays, for proxy wrapping decisions. */
function isWrappableValue(value: unknown): value is object {
  return typeof value === 'object' && value !== null
}

/** A builder method forwarded through the proxy; its result is narrowed by the caller. */
interface ForwardedBuilderMethod {
  <R>(...callArgs: unknown[]): R
}

export const oc = wrapBuilder(baseOc.$meta<AuthMeta>({ devOnly: false }))

function wrapBuilder<T extends object>(builder: T): T {
  return new Proxy(builder, {
    get(target, property) {
      // SAFETY: Proxy trap receives string|symbol keys; keyof T scopes the lookup to the builder.
      const value: unknown = target[property as keyof T]

      if (!isFunctionValue(value)) return value

      return (...args: unknown[]) => {
        // SAFETY: .errors() receives object literals; withCentralErrorMessages validates or throws.
        const nextArgs =
          property === 'errors'
            ? [withCentralErrorMessages(args[0] as Record<string, JsonValue>)]
            : args

        // SAFETY: isFunctionValue above proves callability; the interface names the forwarding shape.
        const result = (value as ForwardedBuilderMethod).call(target, ...nextArgs)

        return isWrappableValue(result) ? wrapBuilder(result) : result
      }
    },
  })
}

function withCentralErrorMessages(errors: Record<string, JsonValue>): Record<string, JsonValue> {
  return Object.fromEntries(
    Object.entries(errors).map(([code, definition]) => {
      // SAFETY: unknown codes fall through to the explicit undefined check below.
      const catalogDefinition = ERROR_CATALOG[code as ContractErrorCode]

      if (catalogDefinition === undefined) {
        throw new TypeError(`Unknown contract error code: ${code}`)
      }

      if (definition === null || !isRecord(definition)) {
        throw new TypeError(`Contract error ${code} must use an object definition`)
      }

      if ('status' in definition) {
        throw new TypeError(`Contract error ${code} must not define catalog status`)
      }

      if ('message' in definition) {
        throw new TypeError(`Contract error ${code} must not define catalog message`)
      }

      const output: Record<string, JsonValue> = {}

      for (const [key, val] of Object.entries(definition)) output[key] = val
      output['status'] = catalogDefinition.status
      output['message'] = catalogDefinition.message

      return [code, output]
    }),
  )
}
