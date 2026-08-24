declare module 'psl' {
  interface ParsedDomain {
    readonly input: string
    readonly tld: string | null
    readonly sld: string | null
    readonly domain: string | null
    readonly subdomain: string | null
    readonly listed: boolean
    readonly error?: never
  }

  interface ParseError {
    readonly input: string
    readonly error: { readonly code: string; readonly message: string }
    readonly domain?: never
    readonly listed?: never
  }

  export function parse(input: string): ParsedDomain | ParseError
}
