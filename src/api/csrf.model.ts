import { ApiError } from './api-error.ts'

/**
 * CSRF token of a Spring Security application, in the JSON format of Spring's `CsrfToken`
 */
export interface CsrfToken {
  /** Token value */
  readonly token: string
  /** Name of the request header to send the token in, e.g. `X-CSRF-TOKEN` */
  readonly headerName: string
  /** Name of the form parameter to send the token in, e.g. `_csrf` */
  readonly parameterName: string
}

/**
 * Source of the CSRF token, which session-based credentials send with state-changing requests
 * @see SessionCredentials
 */
export interface CsrfTokenSource {
  /** Currently known token, or `undefined` if it has not been loaded (yet) */
  readonly current: undefined | CsrfToken

  /** Load the token, unless it is known already */
  load(): Promise<undefined | CsrfToken>

  /** Discard the current token and load it again, e.g. after the session has changed */
  refresh(): Promise<undefined | CsrfToken>
}

const csrfSafeMethods: ReadonlySet<string> = new Set(['GET', 'HEAD', 'OPTIONS', 'TRACE'])

/**
 * Whether a request of the given HTTP method requires a CSRF token.
 * Spring Security protects all methods except `GET`, `HEAD`, `OPTIONS` and `TRACE`.
 * Requests without method are treated as `GET` requests.
 */
export function requiresCsrfToken(method: undefined | string): boolean {
  return !csrfSafeMethods.has((method ?? 'GET').toUpperCase())
}

/**
 * Options of {@link csrfTokenEndpoint}
 */
export interface CsrfTokenEndpointOptions {
  /** Credentials mode of the token request: `include` (default) or `same-origin` */
  readonly credentials?: 'include' | 'same-origin'
  /** Fetch implementation used to request the token, defaults to the global `fetch` */
  readonly fetch?: typeof fetch
}

/**
 * CSRF token source requesting the token from a server endpoint, which responds with the {@link CsrfToken} JSON of the
 * current session. The token is requested once, when it is needed for the first time; concurrent requests share the
 * same response. A failed request rejects with an {@link ApiError}, and is repeated on the next {@link load}.
 * @param url Absolute URL of the CSRF token endpoint, e.g. `new URL('csrf', apiUrl)`
 * @param options Options of the token request
 */
export function csrfTokenEndpoint(url: string | URL, options: CsrfTokenEndpointOptions = {}): CsrfTokenSource {
  const { fetch: fetchFn = fetch, credentials = 'include' } = options
  return new CsrfTokenEndpoint(url, fetchFn, credentials)
}

class CsrfTokenEndpoint implements CsrfTokenSource {
  private _pending?: Promise<CsrfToken>

  constructor(
    private readonly url: string | URL,
    private readonly fetchFn: typeof fetch,
    private readonly credentials: RequestCredentials,
  ) {
    this._current = undefined
  }

  private _current: undefined | CsrfToken

  get current(): undefined | CsrfToken {
    return this._current
  }

  load(): Promise<CsrfToken> {
    if (this._current) return Promise.resolve(this._current)
    if (this._pending) return this._pending

    // Only the latest request may set the token, a refresh discards the results of earlier requests
    const pending: Promise<CsrfToken> = this.fetchToken().then(
      (token: CsrfToken) => {
        if (this._pending === pending) {
          this._current = token
          delete this._pending
        }
        return token
      },
      (error: unknown) => {
        if (this._pending === pending) delete this._pending
        throw error
      },
    )

    this._pending = pending
    return pending
  }

  refresh(): Promise<CsrfToken> {
    this._current = undefined
    delete this._pending
    return this.load()
  }

  private async fetchToken(): Promise<CsrfToken> {
    const headers = new Headers()
    headers.set('Accept', 'application/json')

    const response = await this.fetchFn(this.url, {
      method: 'GET',
      credentials: this.credentials,
      headers,
    })

    const body: unknown = await response.json().catch(() => undefined)
    if (!response.ok) throw ApiError.fromResponse(response.status, body)
    if (!isCsrfToken(body)) {
      const { status } = response
      throw new ApiError('csrf-token-invalid', { status }, { status })
    }

    return {
      token: body.token,
      headerName: body.headerName,
      parameterName: body.parameterName,
    }
  }
}

function isCsrfToken(body: unknown): body is CsrfToken {
  if (typeof body !== 'object' || body === null) return false
  const { token, headerName, parameterName } = body as Partial<Record<keyof CsrfToken, unknown>>
  return typeof token === 'string' && typeof headerName === 'string' && typeof parameterName === 'string'
}

/**
 * Options of {@link csrfTokenCookie}, defaults match Spring Security's `CookieCsrfTokenRepository`
 */
export interface CsrfTokenCookieOptions {
  /** Name of the cookie containing the token, defaults to `XSRF-TOKEN` */
  readonly cookieName?: string
  /** Name of the request header to send the token in, defaults to `X-XSRF-TOKEN` */
  readonly headerName?: string
  /** Name of the form parameter to send the token in, defaults to `_csrf` */
  readonly parameterName?: string
}

/**
 * CSRF token source reading the token from a cookie, e.g. set by Spring Security's
 * `CookieCsrfTokenRepository.withHttpOnlyFalse()`.
 *
 * The cookie is read on each access, so a changed token is used immediately.
 * The cookie must be readable by the application, i.e. not `HttpOnly`, and must be set for the domain of
 * the application, e.g. `example.com` for an application at `app.example.com` and an API at `api.example.com`.
 */
export function csrfTokenCookie(options: CsrfTokenCookieOptions = {}): CsrfTokenSource {
  const { cookieName = 'XSRF-TOKEN', headerName = 'X-XSRF-TOKEN', parameterName = '_csrf' } = options
  const read = (): undefined | CsrfToken => {
    const token = readCookie(cookieName)
    return token === undefined ? undefined : { token, headerName, parameterName }
  }
  return {
    get current() {
      return read()
    },
    load: async () => read(),
    refresh: async () => read(),
  }
}

function readCookie(name: string): undefined | string {
  if (typeof document === 'undefined') return undefined

  for (const cookie of document.cookie.split(';')) {
    const separator = cookie.indexOf('=')
    if (separator >= 0) {
      const cookieName = cookie.slice(0, separator).trim()
      if (cookieName === name) {
        const cookieValue = cookie.slice(separator + 1).trim()
        return decodeCookieValue(cookieValue)
      }
    }
  }

  return undefined
}

function decodeCookieValue(value: string): string {
  try {
    return decodeURIComponent(value)
  } catch {
    return value
  }
}
