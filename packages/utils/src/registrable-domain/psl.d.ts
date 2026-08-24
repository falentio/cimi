declare module 'psl' {
  interface ParsedDomain {
    readonly domain: string | null
    readonly error?: never
  }

  interface ParseError {
    readonly domain?: string | null
    readonly error: { readonly code: string; readonly message: string }
  }

  export function parse(input: string): ParsedDomain | ParseError
}
