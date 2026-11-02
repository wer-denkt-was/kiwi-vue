import type { CsrfToken, CsrfTokenSource } from './csrf.model.ts'
import { requiresCsrfToken } from './csrf.model.ts'

type RequestInput = string | URL
export type RewriteRequestFn = (url: RequestInput) => RequestInput
export type AuthenticateRequestFn = (init: RequestInit) => RequestInit
export type PrepareRequestFn = (init: RequestInit) => void | Promise<void>

/**
 * Interface for credentials authenticating API requests
 */
export interface ApiCredentials {
  /** Apply the authentication to a request, e.g. add an `Authorization` header */
  readonly authenticate: AuthenticateRequestFn

  /** Rewrite the URL of a request, e.g. for proxies */
  readonly rewrite?: RewriteRequestFn

  /**
   * Prepare the authentication of a request before {@link authenticate} is applied, e.g. load a CSRF token.
   * The request is sent once the returned promise resolves, and is rejected with the error if it rejects.
   */
  readonly prepare?: PrepareRequestFn

  isValid(): boolean
}

// eslint-disable-next-line @typescript-eslint/no-namespace
export namespace AuthenticateRequestFn {
  /**
   * Identity authentication, simply returning the `RequestInit` itself without applying any changes.
   * Functionally, this represents `a => a`
   */
  export const identity: AuthenticateRequestFn = init => init

  /**
   * Compose multiple `AuthenticateRequest` functions into a single function.
   * Functionally, this will compose `a => b` with `b => c` into `a => c` as `a => (b => c)`.
   * @example const authenticate = compose(bearerToken(token), addRequestHeader('X-Domain-Id', domainId))
   */
  export function compose(...components: ReadonlyArray<AuthenticateRequestFn>): AuthenticateRequestFn {
    return components.reduce((prev, next) => init => next(prev(init)), identity)
  }
}

/**
 * Credentials containing no user information, and not applying any authentication to the API request
 */
export const missingCredentials: ApiCredentials = {
  authenticate: AuthenticateRequestFn.identity,
  isValid: () => true, // Missing credentials can't be invalid
}

/**
 * Credentials using a username and password to authenticate
 */
export class UsernamePassword implements ApiCredentials {
  readonly authenticate: AuthenticateRequestFn

  constructor(
    readonly username: string,
    readonly password: string,
  ) {
    this.authenticate = httpBasic(username, password)
  }

  isValid(): boolean {
    return true // Username/password is always valid
  }
}

/**
 * Credentials using a JWT bearer token to authenticate, e.g. against a Kiwi-Server application
 * configured as an OAuth2 resource server.
 * The token is considered valid until its `exp` claim has passed, or indefinitely if it has no `exp` claim.
 * The token's signature is not verified, which is the task of the server.
 */
export class JwtBearerToken implements ApiCredentials {
  readonly authenticate: AuthenticateRequestFn
  readonly claims: Readonly<Record<string, unknown>>

  /**
   * @param token Encoded JWT
   * @param leewaySeconds Number of seconds before the expiration at which the token is considered invalid already,
   * to compensate for clock skew and request latency
   */
  constructor(
    readonly token: string,
    readonly leewaySeconds: number = 0,
  ) {
    this.authenticate = bearerToken(token)
    this.claims = jwtDecodeClaims(token)
  }

  /** Expiration timestamp from the `exp` claim, or `undefined` if the token does not expire */
  get expiresAt(): undefined | Date {
    const exp = this.claims.exp
    return typeof exp === 'number' ? new Date(exp * 1_000) : undefined
  }

  isValid(): boolean {
    // Valid until current timestamp in seconds becomes greater than "exp" claim
    const exp = this.claims.exp
    if (typeof exp !== 'number') return true
    const now = Date.now() / 1_000
    return now < exp - this.leewaySeconds
  }
}

/**
 * Options of {@link SessionCredentials}
 */
export interface SessionCredentialsOptions {
  /**
   * Whether the browser sends cookies: `include` (default) sends them to other origins as well,
   * e.g. to an API at `api.example.com` from an application at `app.example.com`; `same-origin` only sends them to the
   * origin of the application, e.g. if the API is served by the same origin through a proxy
   */
  readonly credentials?: 'include' | 'same-origin'
  /**
   * Source of the CSRF token, which is sent with state-changing requests
   * (all methods except `GET`, `HEAD`, `OPTIONS` and `TRACE`)
   */
  readonly csrf?: CsrfTokenSource
  /**
   * Redirect mode of requests:
   * - `manual` (default) does not follow redirects, so that a request redirected to a login page rejects with an `UnauthorizedError`
   * - `follow` follows redirects as instructed in the response
   */
  readonly redirect?: RequestRedirect
}

/**
 * Credentials using a session cookie to authenticate, e.g. the Spring Session cookie that a server application
 * sets after an OAuth2/OIDC login, before redirecting back to the application.
 *
 * The browser sends the cookie with each request, as requests are sent with `credentials: 'include'`.
 * The session is not visible to the frontend application, so these credentials are always valid; requests without
 * valid session reject with an `UnauthorizedError` instead, either by status `401`, or by a redirect to the login page.
 *
 * @see SessionCredentialsOptions
 * @see csrfTokenEndpoint
 * @see createSession
 */
export class SessionCredentials implements ApiCredentials {
  readonly authenticate: AuthenticateRequestFn
  readonly prepare: PrepareRequestFn

  constructor(readonly options: SessionCredentialsOptions = {}) {
    const { credentials = 'include', csrf, redirect = 'manual' } = options
    this.authenticate = init => {
      const authenticated: RequestInit = { ...init, credentials, redirect: init.redirect ?? redirect }
      return csrf && requiresCsrfToken(init.method) ? withCsrfHeader(authenticated, csrf.current) : authenticated
    }
    this.prepare = async init => {
      if (csrf && requiresCsrfToken(init.method)) await csrf.load()
    }
  }

  isValid(): boolean {
    return true // The session is validated by the server
  }
}

/**
 * Extend credentials by further authentication functions, applied after the authentication of the credentials,
 * e.g. to add request headers. The validity, URL rewriting and request preparation of the credentials are retained.
 * @example extendCredentials(new SessionCredentials({ csrf }), addRequestHeader('X-Example-Id', someExampleId))
 */
export function extendCredentials(
  credentials: ApiCredentials,
  ...extensions: ReadonlyArray<AuthenticateRequestFn>
): ApiCredentials {
  const extension = AuthenticateRequestFn.compose(...extensions)
  return {
    authenticate: init => extension(credentials.authenticate(init)),
    rewrite: credentials.rewrite?.bind(credentials),
    prepare: credentials.prepare?.bind(credentials),
    isValid: () => credentials.isValid(),
  }
}

/**
 * Use HTTP "Authorization: Basic <base64(username:password)>" to authenticate against an API.
 * Username and password are encoded as UTF-8.
 */
export function httpBasic(username: string, password: string): AuthenticateRequestFn {
  const basic = base64Encode(`${username}:${password}`)
  return addRequestHeader('Authorization', `Basic ${basic}`)
}

/**
 * Use HTTP "Authorization: Bearer <token>" to authenticate against an API
 */
export function bearerToken(token: string): AuthenticateRequestFn {
  return addRequestHeader('Authorization', `Bearer ${token}`)
}

/**
 * Set a request header, replacing a header of the same name.
 * Supports all forms of `RequestInit.headers`, i.e. a `Headers` instance, an array of pairs and a record.
 */
export function addRequestHeader(name: string, value: string): AuthenticateRequestFn {
  return init => {
    const headers = new Headers(init.headers)
    headers.set(name, value)
    return { ...init, headers }
  }
}

function withCsrfHeader(init: RequestInit, csrfToken: undefined | CsrfToken): RequestInit {
  return csrfToken ? addRequestHeader(csrfToken.headerName, csrfToken.token)(init) : init
}

function base64Encode(text: string): string {
  const encoder = new TextEncoder()
  const bytes = encoder.encode(text)
  return btoa(Array.from(bytes, byte => String.fromCharCode(byte)).join(''))
}

function jwtDecodeClaims(jwt: string): Record<string, unknown> {
  // JWT format: "${header}.${base64url(payload)}.${signature}"
  // For decoding, base64url (using "-" and "_") must be converted to JS base64 (using "+" and "/" respectively),
  // and the decoded bytes must be interpreted as UTF-8
  // See: https://base64.guru/standards/base64url
  // RFC: https://datatracker.ietf.org/doc/html/rfc4648
  const [, base64url = ''] = jwt.split('.')
  const base64 = base64url.replace(/-/g, '+').replace(/_/g, '/')
  const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), '=')
  const bytes = Uint8Array.from(atob(padded), char => char.charCodeAt(0))
  const decoder = new TextDecoder()
  const payload = decoder.decode(bytes)
  const claims: unknown = JSON.parse(payload)
  if (typeof claims !== 'object' || claims === null || Array.isArray(claims)) {
    throw new Error('Invalid JWT: payload is not a JSON object')
  }
  return claims as Record<string, unknown>
}
