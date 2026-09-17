import * as v from 'valibot'
import { ConfigError } from './error.ts'

export function parseConfig<TInput, TOutput, TIssue extends v.BaseIssue<unknown>>(
  schema: v.BaseSchema<TInput, TOutput, TIssue>,
  input: unknown,
  source: 'environment' | 'logging',
): TOutput {
  const result = v.safeParse(schema, input)
  if (!result.success) {
    throw new ConfigError(`Invalid ${source} configuration: ${formatIssues(result.issues)}`)
  }

  return result.output
}

function formatIssues(issues: readonly v.BaseIssue<unknown>[]): string {
  return issues
    .map((issue) => {
      const key = issue.path?.map((item) => String(item.key)).join('.') || 'configuration'
      return `${key}: ${issue.message}`
    })
    .join('; ')
}
