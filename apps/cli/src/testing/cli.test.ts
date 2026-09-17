import { describe, expect, test, vi } from 'vitest'
import { createCli } from '../index.ts'

function memoryWriter() {
  const chunks: string[] = []
  return {
    write(chunk: string) {
      chunks.push(chunk)
    },
    text() {
      return chunks.join('')
    },
  }
}

function createTestCli(
  stdout: ReturnType<typeof memoryWriter>,
  stderr: ReturnType<typeof memoryWriter>,
  exit: (code: number) => void,
) {
  return createCli({
    name: 'cimi',
    version: '0.0.1',
    stdout,
    stderr,
    exit,
    prompt: { ask: vi.fn(async () => undefined) },
    authLogin: vi.fn(async () => ({
      ok: false as const,
      failure: { kind: 'input-cancelled' as const },
    })),
  })
}

describe('createCli', () => {
  test('can import the process entrypoint without invoking it', async () => {
    const previousArgv = process.argv
    const previousExitCode = process.exitCode
    process.argv = ['node', 'cimi', 'not-a-command']
    process.exitCode = undefined

    try {
      await import('../bin.ts')
      expect(process.exitCode).toBeUndefined()
    } finally {
      process.argv = previousArgv
      process.exitCode = previousExitCode
    }
  })

  test('shows help for an empty argv', async () => {
    const stdout = memoryWriter()
    const stderr = memoryWriter()
    const exit = vi.fn<(code: number) => void>()
    const run = createTestCli(stdout, stderr, exit)

    await expect(run([])).resolves.toBe(0)

    expect(stdout.text()).toContain('Usage')
    expect(stderr.text()).toBe('')
    expect(exit).toHaveBeenCalledWith(0)
  })

  test('shows help when requested', async () => {
    const stdout = memoryWriter()
    const stderr = memoryWriter()
    const exit = vi.fn<(code: number) => void>()
    const run = createTestCli(stdout, stderr, exit)

    await expect(run(['--help'])).resolves.toBe(0)

    expect(stdout.text()).toContain('Usage')
    expect(stderr.text()).toBe('')
    expect(exit).toHaveBeenCalledWith(0)
  })

  test('shows the configured version', async () => {
    const stdout = memoryWriter()
    const stderr = memoryWriter()
    const exit = vi.fn<(code: number) => void>()
    const run = createTestCli(stdout, stderr, exit)

    await expect(run(['--version'])).resolves.toBe(0)

    expect(stdout.text()).toBe('cimi/0.0.1\n')
    expect(stderr.text()).toBe('')
    expect(exit).toHaveBeenCalledWith(0)
  })

  test('reports unknown input as a usage error', async () => {
    const stdout = memoryWriter()
    const stderr = memoryWriter()
    const exit = vi.fn<(code: number) => void>()
    const run = createTestCli(stdout, stderr, exit)

    await expect(run(['not-a-command'])).resolves.toBe(1)

    expect(stdout.text()).toBe('')
    expect(stderr.text()).toContain('not-a-command')
    expect(exit).toHaveBeenCalledWith(1)
  })

  test('reports arguments after the delimiter as a usage error', async () => {
    const stdout = memoryWriter()
    const stderr = memoryWriter()
    const exit = vi.fn<(code: number) => void>()
    const run = createTestCli(stdout, stderr, exit)

    await expect(run(['--', 'not-a-command'])).resolves.toBe(1)

    expect(stdout.text()).toBe('')
    expect(stderr.text()).toContain('not-a-command')
    expect(exit).toHaveBeenCalledWith(1)
  })

  test('does not retain invocation state across runs', async () => {
    const stdout = memoryWriter()
    const stderr = memoryWriter()
    const exit = vi.fn<(code: number) => void>()
    const run = createTestCli(stdout, stderr, exit)

    await expect(run(['--version'])).resolves.toBe(0)
    await expect(run([])).resolves.toBe(0)

    expect(stdout.text()).toBe(
      'cimi/0.0.1\nUsage:\n  $ cimi [options]\n  $ cimi auth login [options]\n\nCommands:\n  auth login     Authenticate with a Cimi server\n\nOptions:\n  -h, --help     Display this message\n  -v, --version  Display version number\n',
    )
    expect(stderr.text()).toBe('')
    expect(exit).toHaveBeenCalledTimes(2)
    expect(exit).toHaveBeenNthCalledWith(1, 0)
    expect(exit).toHaveBeenNthCalledWith(2, 0)
  })

  test('passes an explicit origin to auth login without prompting', async () => {
    const stdout = memoryWriter()
    const stderr = memoryWriter()
    const exit = vi.fn<(code: number) => void>()
    const authLogin = vi.fn(async () => ({
      ok: false as const,
      failure: { kind: 'input-cancelled' as const },
    }))
    const prompt = { ask: vi.fn(async () => 'prompted.example.com') }
    const run = createCli({
      name: 'cimi',
      version: '0.0.1',
      stdout,
      stderr,
      exit,
      prompt,
      authLogin,
    })

    await expect(run(['auth', 'login', '--origin', 'https://one.example.com'])).resolves.toBe(1)

    expect(prompt.ask).not.toHaveBeenCalled()
    expect(authLogin).toHaveBeenCalledWith(
      expect.objectContaining({ originInput: 'https://one.example.com' }),
    )
    expect(stderr.text()).toContain('Authentication was cancelled')
  })

  test('prompts for a server origin when auth login has no explicit origin', async () => {
    const stdout = memoryWriter()
    const stderr = memoryWriter()
    const exit = vi.fn<(code: number) => void>()
    const authLogin = vi.fn(async () => ({
      ok: false as const,
      failure: { kind: 'input-cancelled' as const },
    }))
    const prompt = { ask: vi.fn(async () => 'one.example.com') }
    const run = createCli({
      name: 'cimi',
      version: '0.0.1',
      stdout,
      stderr,
      exit,
      prompt,
      authLogin,
    })

    await expect(run(['auth', 'login'])).resolves.toBe(1)

    expect(prompt.ask).toHaveBeenCalledWith('Server hostname or URL: ')
    expect(authLogin).toHaveBeenCalledWith(
      expect.objectContaining({ originInput: 'one.example.com' }),
    )
  })
})
