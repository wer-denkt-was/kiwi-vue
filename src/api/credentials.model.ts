type RequestInput = string | URL
export type RewriteRequestFn = (url: RequestInput) => RequestInput
export type AuthenticateRequestFn = (init: RequestInit) => RequestInit

/**
 * Interface for credentials authenticating API requests
 */
export interface ApiCredentials {
  readonly authenticate: AuthenticateRequestFn
  readonly rewrite?: RewriteRequestFn

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
   * @example const authenticate = compose(bearerToken(token), addHeader('X-Domain-Id', domainId))
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
  constructor(
    readonly username: string,
    readonly password: string,
  ) {
    this.authenticate = httpBasic(username, password)
  }

  readonly userDetails = null
  readonly authenticate: AuthenticateRequestFn

  isValid(): boolean {
    return true // Username/password is always valid
  }
}

/**
 * Credentials using a JWT bearer token to authenticate
 */
export class JwtBearerToken implements ApiCredentials {
  constructor(readonly token: string) {
    this.authenticate = bearerToken(token)
    this.claims = jwtDecodeClaims(token) // Use JWT claims for expiration timestamp
  }

  readonly authenticate: AuthenticateRequestFn
  readonly claims: Record<string, unknown>

  isValid(): boolean {
    // Valid until current timestamp in seconds becomes greater than "exp" claim
    const now = Date.now() / 1_000
    const expires = this.claims.exp as number
    return now < expires
  }
}

/**
 * Use HTTP "Authorization: Basic <base64(username:password)>" to authenticate against an API
 */
export function httpBasic(username: string, password: string): AuthenticateRequestFn {
  const basic = window.btoa(`${username}:${password}`)
  return addRequestHeader('Authorization', `Basic ${basic}`)
}

/**
 * User HTTP "Authorization: Bearer <token>" to authenticate against an API
 */
export function bearerToken(token: string): AuthenticateRequestFn {
  return addRequestHeader('Authorization', `Bearer ${token}`)
}

export function addRequestHeader(name: string, value: string): AuthenticateRequestFn {
  return init => {
    const headers = Object.assign({}, init.headers, { [name]: value })
    return { ...init, headers }
  }
}

function jwtDecodeClaims(jwt: string): Record<string, unknown> {
  // JWT format: "${header}.${base64url(payload)}.${signature}"
  // For decoding, base64url (using "-" and "_") must be converted to JS base64 (using "+" and "/" respectively)
  // See: https://base64.guru/standards/base64url
  // RFC: https://datatracker.ietf.org/doc/html/rfc4648
  const [, base64url = ''] = jwt.split('.')
  const base64 = base64url.replace(/-/g, '+').replace(/_/g, '/')
  const payload = decodeURIComponent(atob(base64))
  return JSON.parse(payload)
}
