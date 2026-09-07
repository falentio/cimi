import { createOpencodeClient } from '@opencode-ai/sdk'

type Command =
  | { kind: 'list' }
  | { kind: 'create' }
  | {
      kind: 'chat'
      sessionId: string
      text: string
      modelId: string
      providerId: string
    }

class UsageError extends Error {}

const usage = `Usage:
  pnpm opencode list
  pnpm opencode create
  pnpm opencode chat --session <id> --text <message> [--model-id <id>] [--provider-id <id>]`

function requiredOption(value: unknown, option: string): string {
  if (typeof value !== 'string' || value.length === 0 || value.startsWith('--')) {
    throw new UsageError(`Missing value for ${option}.\n${usage}`)
  }

  return value
}

function parseChat(
  args: readonly unknown[],
  environment: Readonly<Record<string, string | undefined>>,
): Command {
  let sessionId: string | undefined
  let text: string | undefined
  let modelId: string | undefined
  let providerId: string | undefined

  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index]
    if (typeof argument !== 'string') {
      throw new UsageError(`Invalid argument.\n${usage}`)
    }

    if (
      argument !== '--session' &&
      argument !== '--text' &&
      argument !== '--model-id' &&
      argument !== '--provider-id'
    ) {
      throw new UsageError(`Unknown argument: ${argument}.\n${usage}`)
    }

    const value = requiredOption(args[index + 1], argument)
    index += 1

    if (argument === '--session') sessionId = value
    if (argument === '--text') text = value
    if (argument === '--model-id') modelId = value
    if (argument === '--provider-id') providerId = value
  }

  const resolvedSessionId = sessionId
  const resolvedText = text
  const resolvedModelId = modelId ?? environment['OPENCODE_MODEL_ID']
  const resolvedProviderId = providerId ?? environment['OPENCODE_PROVIDER_ID']

  if (resolvedSessionId === undefined) {
    throw new UsageError(`Missing required option: --session.\n${usage}`)
  }
  if (resolvedText === undefined) {
    throw new UsageError(`Missing required option: --text.\n${usage}`)
  }
  if (resolvedModelId === undefined || resolvedModelId.length === 0) {
    throw new UsageError(`Missing model ID. Pass --model-id or set OPENCODE_MODEL_ID.\n${usage}`)
  }
  if (resolvedProviderId === undefined || resolvedProviderId.length === 0) {
    throw new UsageError(
      `Missing provider ID. Pass --provider-id or set OPENCODE_PROVIDER_ID.\n${usage}`,
    )
  }

  return {
    kind: 'chat',
    sessionId: resolvedSessionId,
    text: resolvedText,
    modelId: resolvedModelId,
    providerId: resolvedProviderId,
  }
}

function parseArgs(
  args: readonly unknown[],
  environment: Readonly<Record<string, string | undefined>>,
): Command {
  const command = args[0]
  if (command === 'list' && args.length === 1) return { kind: 'list' }
  if (command === 'create' && args.length === 1) return { kind: 'create' }
  if (command === 'chat') return parseChat(args.slice(1), environment)
  throw new UsageError(`Unknown or missing command.\n${usage}`)
}

async function run(command: Command): Promise<void> {
  const directory = process.cwd()
  const client = createOpencodeClient({
    baseUrl: process.env['OPENCODE_BASE_URL'] ?? 'http://localhost:54321',
    directory,
  })

  const result =
    command.kind === 'list'
      ? await client.session.list({
          query: { directory },
          responseStyle: 'data',
          throwOnError: true,
        })
      : command.kind === 'create'
        ? await client.session.create({
            query: { directory },
            responseStyle: 'data',
            throwOnError: true,
          })
        : await client.session.prompt({
            path: { id: command.sessionId },
            query: { directory },
            body: {
              parts: [{ type: 'text', text: command.text }],
              model: { providerID: command.providerId, modelID: command.modelId },
            },
            responseStyle: 'data',
            throwOnError: true,
          })

  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)
}

try {
  await run(parseArgs(process.argv.slice(2), process.env))
} catch (error: unknown) {
  const message = error instanceof Error ? error.message : String(error)
  process.stderr.write(`${message}\n`)
  process.exitCode = 1
}
