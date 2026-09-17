import { spawn } from 'node:child_process'
import { platform } from 'node:process'

export function openBrowser(url: string): Promise<boolean> {
  const command = platform === 'darwin' ? 'open' : platform === 'win32' ? 'start' : 'xdg-open'
  return new Promise((resolve) => {
    const child = spawn(command, [url], { stdio: 'ignore', windowsHide: true })
    child.once('error', () => resolve(false))
    child.once('close', (code) => resolve(code === 0))
  })
}
