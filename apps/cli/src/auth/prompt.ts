import { createInterface } from 'node:readline/promises'
import { stdin, stdout } from 'node:process'

export interface CliPrompt {
  ask(question: string): Promise<string | undefined>
}

export function createTerminalPrompt(): CliPrompt {
  return {
    async ask(question) {
      const input = createInterface({ input: stdin, output: stdout })
      try {
        const answer = await input.question(question)
        return answer.trim() || undefined
      } finally {
        input.close()
      }
    },
  }
}
