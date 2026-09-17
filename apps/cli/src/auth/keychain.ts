import { execFile, spawn } from 'node:child_process'
import { platform } from 'node:process'
import { promisify } from 'node:util'
import type { SecretStore } from './profile.ts'

const execFileAsync = promisify(execFile)

export function createSystemSecretStore(): SecretStore {
  if (platform === 'darwin') return createMacOsSecretStore()
  if (platform === 'linux') return createLinuxSecretStore()
  throw new Error('Cimi CLI authentication requires a supported system credential store')
}

function createMacOsSecretStore(): SecretStore {
  return {
    async read(service, account) {
      try {
        const result = await execFileAsync('security', [
          'find-generic-password',
          '-s',
          service,
          '-a',
          account,
          '-w',
        ])
        return result.stdout.trim() || null
      } catch {
        return null
      }
    },
    async write(service, account, value) {
      await execFileAsync('security', [
        'add-generic-password',
        '-U',
        '-s',
        service,
        '-a',
        account,
        '-w',
        value,
      ])
    },
  }
}

function createLinuxSecretStore(): SecretStore {
  return {
    async read(service, account) {
      try {
        const result = await execFileAsync('secret-tool', [
          'lookup',
          'service',
          service,
          'account',
          account,
        ])
        return result.stdout.trim() || null
      } catch {
        return null
      }
    },
    async write(service, account, value) {
      await spawnWithInput(
        'secret-tool',
        ['store', '--label=Cimi authentication', 'service', service, 'account', account],
        value,
      )
    },
  }
}

function spawnWithInput(command: string, args: readonly string[], input: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ['pipe', 'ignore', 'pipe'] })
    const errors: Buffer[] = []
    child.stderr?.on('data', (chunk: Buffer) => errors.push(chunk))
    child.once('error', reject)
    child.once('close', (code) => {
      if (code === 0) resolve()
      else reject(new Error(Buffer.concat(errors).toString('utf8') || `${command} failed`))
    })
    child.stdin?.end(input)
  })
}
