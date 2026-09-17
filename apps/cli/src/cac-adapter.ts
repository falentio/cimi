import { cac, type CAC } from 'cac'
import type { CliInvocationContext } from './index.ts'

export function createCacCli(name: string, context: CliInvocationContext): CAC {
  const cli = cac(name)
  cli.version(context.version)
  cli.help()
  cli.showHelpOnExit = false
  cli.showVersionOnExit = false
  cli.command('', 'Display help').action(() => writeHelp(context, name))
  cli
    .command('auth <action>', 'Authenticate this CLI with a Cimi server')
    .option('--origin <origin>', 'Server hostname or URL')
    .action(async (action: string, options: { readonly origin?: string }) => {
      if (action !== 'login') throw new Error(`Unknown auth action: ${action}`)
      const originInput = options.origin ?? (await context.prompt.ask('Server hostname or URL: '))
      if (originInput === undefined) throw new Error('A server hostname or URL is required')

      const result = await context.authLogin({ originInput, output: context.stdout })
      if (!result.ok) throw new Error(formatAuthFailure(result.failure))
    })
  return cli
}

export function writeHelp(context: CliInvocationContext, name: string): void {
  context.stdout.write(
    `Usage:\n  $ ${name} [options]\n  $ ${name} auth login [options]\n\nCommands:\n  auth login     Authenticate with a Cimi server\n\nOptions:\n  -h, --help     Display this message\n  -v, --version  Display version number\n`,
  )
}

export function writeVersion(context: CliInvocationContext, name: string): void {
  context.stdout.write(`${name}/${context.version}\n`)
}

function formatAuthFailure(failure: { readonly kind: string; readonly reason?: string }): string {
  switch (failure.kind) {
    case 'invalid-origin':
      return `Invalid server origin: ${failure.reason}`
    case 'device-code-request-failed':
      return 'The server rejected the device authorization request'
    case 'device-response-invalid':
      return 'The server returned an invalid device authorization response'
    case 'verification-url-invalid':
      return 'The server returned an unsafe verification URL'
    case 'authorization-failed':
      return failure.reason === 'denied'
        ? 'Device authorization was denied'
        : failure.reason === 'expired'
          ? 'Device authorization expired'
          : 'Device authorization failed'
    case 'session-response-invalid':
      return 'The server returned an invalid session response'
    case 'credential-store-failed':
      return 'The system credential store could not save the session'
    case 'network-error':
      return 'The authentication request could not reach the server'
    default:
      return 'Authentication was cancelled'
  }
}
