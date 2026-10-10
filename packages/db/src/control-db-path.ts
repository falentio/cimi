import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const WORKSPACE_ROOT = fileURLToPath(new URL('../../', import.meta.url))

export function resolveControlDbPath(
  env: Record<string, string | undefined> = process.env,
  workingDirectory: string = WORKSPACE_ROOT,
): string {
  const configuredPath = env['CIMI_CONTROL_DB_PATH']

  if (configuredPath !== undefined) return resolve(workingDirectory, configuredPath)

  const dataDirectory = env['CIMI_DATA_DIR'] ?? '.cimi'

  return resolve(workingDirectory, dataDirectory, 'control.sqlite')
}
