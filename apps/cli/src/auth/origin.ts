export interface ServerOrigin {
  readonly kind: 'server-origin'
  readonly value: string
  readonly hostname: string
}

export type ServerOriginFailure =
  | 'empty'
  | 'invalid-url'
  | 'unsupported-protocol'
  | 'insecure-network-origin'
  | 'credentials-not-allowed'
  | 'path-not-allowed'
  | 'query-not-allowed'
  | 'fragment-not-allowed'

export type ServerOriginResult =
  | { readonly ok: true; readonly origin: ServerOrigin }
  | { readonly ok: false; readonly reason: ServerOriginFailure }

export function parseServerOrigin(input: string): ServerOriginResult {
  const value = input.trim()
  if (value.length === 0) return { ok: false, reason: 'empty' }

  let url: URL
  try {
    url = new URL(value.includes('://') ? value : `https://${value}`)
  } catch {
    return { ok: false, reason: 'invalid-url' }
  }

  if (url.username.length > 0 || url.password.length > 0) {
    return { ok: false, reason: 'credentials-not-allowed' }
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    return { ok: false, reason: 'unsupported-protocol' }
  }
  if (url.protocol === 'http:' && !isLoopbackHostname(url.hostname)) {
    return { ok: false, reason: 'insecure-network-origin' }
  }
  if (url.pathname !== '/') return { ok: false, reason: 'path-not-allowed' }
  if (url.search.length > 0) return { ok: false, reason: 'query-not-allowed' }
  if (url.hash.length > 0) return { ok: false, reason: 'fragment-not-allowed' }

  return {
    ok: true,
    origin: {
      kind: 'server-origin',
      value: url.origin,
      hostname: url.hostname,
    },
  }
}

function isLoopbackHostname(hostname: string): boolean {
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]'
}
