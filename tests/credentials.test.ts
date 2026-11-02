import { describe, expect, it } from 'vitest'
import { addRequestHeader, AuthenticateRequestFn, CredentialsInvalid, httpBasic, JwtBearerToken } from '@/api'
import { empty, mockApi } from './helpers'

function jwt(claims: Record<string, unknown>): string {
  const bytes = new TextEncoder().encode(JSON.stringify(claims))
  const base64url = btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
  return `eyJhbGciOiJIUzI1NiJ9.${base64url}.signature`
}

describe('JwtBearerToken', () => {
  it('decodes UTF-8 claims without padding', () => {
    const token = new JwtBearerToken(jwt({ sub: 'Jürgen 🥝', exp: 4_000_000_000 }))
    expect(token.claims.sub).toBe('Jürgen 🥝')
    expect(token.expiresAt).toEqual(new Date(4_000_000_000_000))
    expect(token.isValid()).toBe(true)
  })

  it('is invalid after expiration, considering the leeway', () => {
    const now = Math.floor(Date.now() / 1_000)
    expect(new JwtBearerToken(jwt({ exp: now - 1 })).isValid()).toBe(false)
    expect(new JwtBearerToken(jwt({ exp: now + 30 }), 60).isValid()).toBe(false)
    expect(new JwtBearerToken(jwt({ exp: now + 120 }), 60).isValid()).toBe(true)
  })

  it('is valid without expiration', () => {
    expect(new JwtBearerToken(jwt({ sub: 'user' })).isValid()).toBe(true)
  })

  it('fails requests with expired credentials', async () => {
    const credentials = new JwtBearerToken(jwt({ exp: 1 }))
    const { api, requests } = mockApi([empty(200)], { credentials })
    await expect(api.request('TodoItem')).rejects.toBeInstanceOf(CredentialsInvalid)
    expect(requests).toHaveLength(0)
  })
})

describe('authentication functions', () => {
  it('encodes basic credentials as UTF-8', () => {
    const init = httpBasic('jürgen', 'pässword')({})
    const encoded = new Headers(init.headers).get('Authorization')?.replace('Basic ', '') ?? ''
    const decoded = new TextDecoder().decode(Uint8Array.from(atob(encoded), c => c.charCodeAt(0)))
    expect(decoded).toBe('jürgen:pässword')
  })

  it('adds headers to all forms of request headers', () => {
    const authenticate = AuthenticateRequestFn.compose(
      addRequestHeader('X-Tenant', 'a'),
      addRequestHeader('Authorization', 'Bearer t'),
    )
    for (const headers of [new Headers({ Accept: 'x' }), [['Accept', 'x']] as [string, string][], { Accept: 'x' }]) {
      const result = new Headers(authenticate({ headers }).headers)
      expect([result.get('Accept'), result.get('X-Tenant'), result.get('Authorization')]).toEqual([
        'x',
        'a',
        'Bearer t',
      ])
    }
  })
})
