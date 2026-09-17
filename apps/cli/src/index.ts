import { createCacCli, writeHelp, writeVersion } from './cac-adapter.ts'

export interface TextWriter {
  write(text: string): void | boolean
}

export interface CreateCliDependencies {
  readonly name: string
  readonly version: string
  readonly stdout: TextWriter
  readonly stderr: TextWriter
  readonly exit: (code: number) => void
}

export interface CliInvocationContext {
  readonly argv: readonly string[]
  readonly version: string
  readonly stdout: TextWriter
  readonly stderr: TextWriter
}

export type CliRunner = (argv: readonly string[]) => Promise<number>

export function createCli(dependencies: CreateCliDependencies): CliRunner {
  return async function run(argv: readonly string[]): Promise<number> {
    const context: CliInvocationContext = {
      argv,
      version: dependencies.version,
      stdout: dependencies.stdout,
      stderr: dependencies.stderr,
    }
    const cli = createCacCli(dependencies.name, context)

    try {
      const parsed = cli.parse(['node', dependencies.name, ...argv], { run: false })

      const delimiterArgs: unknown = parsed.options['--']
      if (Array.isArray(delimiterArgs) && delimiterArgs.length > 0) {
        throw new Error(
          `Unused args: ${delimiterArgs.map((arg) => `\`${String(arg)}\``).join(', ')}`,
        )
      }

      if (parsed.options['help'] === true) {
        writeHelp(context, dependencies.name)
        dependencies.exit(0)
        return 0
      }

      if (parsed.options['version'] === true) {
        writeVersion(context, dependencies.name)
        dependencies.exit(0)
        return 0
      }

      await cli.runMatchedCommand()
      dependencies.exit(0)
      return 0
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error)
      context.stderr.write(`${message}\n`)
      dependencies.exit(1)
      return 1
    }
  }
}
