import { cac, type CAC } from 'cac'
import type { CliInvocationContext } from './index.ts'

export function createCacCli(name: string, context: CliInvocationContext): CAC {
  const cli = cac(name)
  cli.version(context.version)
  cli.help()
  cli.showHelpOnExit = false
  cli.showVersionOnExit = false
  cli.command('', 'Display help').action(() => writeHelp(context, name))
  return cli
}

export function writeHelp(context: CliInvocationContext, name: string): void {
  context.stdout.write(
    `Usage:\n  $ ${name} [options]\n\nOptions:\n  -h, --help     Display this message\n  -v, --version  Display version number\n`,
  )
}

export function writeVersion(context: CliInvocationContext, name: string): void {
  context.stdout.write(`${name}/${context.version}\n`)
}
