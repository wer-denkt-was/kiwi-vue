import { ComputedRef, ShallowRef } from 'vue'
import { type CsrfToken, type CsrfTokenSource, UnauthorizedError } from '@/api'
import { LoadingState, useLoading } from '@/services/loading.service'

type LoadUserFn<U> = (signal: AbortSignal) => Promise<U>
type LoginUrnFn = (returnUrl: string) => string | URL
type NavigateFn = (url: string) => void

/**
 * Options of a {@link SessionService}
 * @template U Type representing a User instance
 * @see createSession
 */
export interface SessionOptions<U> {
  /**
   * Load the user of the current session, e.g. `GET /UserAccount/me`. Rejecting with an `UnauthorizedError`
   * (status `401`, or a redirect to the login page) means that the session is not authenticated.
   */
  readonly loadUser: LoadUserFn<U>

  /**
   * URL of the login page, e.g. the OAuth2 authorization endpoint of Spring Security (`/oauth2/authorization/<id>`),
   * or a function creating it from the URL of the application page to return to after the login.
   */
  readonly loginUrl: string | URL | LoginUrnFn

  /**
   * URL of the logout endpoint, e.g. Spring Security's `/logout`
   */
  readonly logoutUrl: string | URL

  /**
   * HTTP method of the logout: `POST` (default) submits a form including the CSRF token
   * (if a {@link csrf} source is given), as required by Spring Security's logout
   * with CSRF protection; `GET` navigates to the logout URL.
   */
  readonly logoutMethod?: 'POST' | 'GET'

  /** Source of the CSRF token submitted with the logout, usually the source of the `SessionCredentials` */
  readonly csrf?: CsrfTokenSource

  /** Navigate the browser to a URL, defaults to `window.location.assign(url)` */
  readonly navigate?: NavigateFn
}

/**
 * Service for the authentication state of a session-based login, e.g. an OAuth2/OIDC login
 * of an application server that establishes a session cookie. Login and logout navigate the
 * browser to the server, which redirects back to the frontend application afterward.
 * By this mechanism, a session-cookie is set and associated with the application server domain,
 * which is used for authentication by `SessionCredentials`.
 */
export interface SessionService<U> {
  /** Loading state of the session user, which is `null` if the session is not authenticated */
  readonly state: Readonly<ShallowRef<LoadingState<null | U>>>

  /** User of the session, or `null` if not authenticated (yet); retained while refreshing */
  readonly user: ComputedRef<null | U>

  /** Whether the session is known to be authenticated */
  readonly isAuthenticated: ComputedRef<boolean>

  /**
   * Load the user of the current session, e.g. on startup of the application, or periodically to detect an expired
   * session. Resolves `null` if the session is not authenticated, and rejects for other errors.
   * @param pending Whether to switch to pending state (default), or to keep the current state until loaded
   */
  refresh(pending?: boolean): Promise<null | U>

  /**
   * Navigate to the login page
   * @param returnUrl URL of the application page to return to after the login, defaults to the current page
   */
  login(returnUrl?: string): void

  /** Discard the session user, and navigate to the logout endpoint */
  logout(): Promise<void>
}

/**
 * Create a {@link SessionService}, e.g. once for the application.
 *
 * @example ```ts
 * const csrf = csrfTokenEndpoint(new URL('csrf', apiUrl))
 * const api = createApi({ apiUrl, credentials: new SessionCredentials({ csrf }) })
 * const session = createSession({
 *   loadUser: signal => api.request('UserAccount/me', {}, { signal }).then(r => unwrapResponseJson<IUserAccount>(r)),
 *   loginUrl: new URL('oauth2/authorization/keycloak', apiUrl),
 *   logoutUrl: new URL('logout', apiUrl),
 *   csrf,
 * })
 * ```
 * @see provideSession
 */
export function createSession<U>(options: SessionOptions<U>): SessionService<U> {
  return new SessionServiceImpl(options)
}

const sessionKey = Symbol('session') as InjectionKey<SessionService<unknown>>

const defaultNavigate = (url: string | URL) => window.location.assign(url)

/**
 * Provide a {@link SessionService} in the current context, either the given instance,
 * or a new instance created from the given {@link SessionOptions}.
 */
export function provideSession<U>(sessionOrOptions: SessionService<U> | SessionOptions<U>): SessionService<U> {
  const session = 'user' in sessionOrOptions ? sessionOrOptions : createSession(sessionOrOptions)
  provide(sessionKey, session)
  return session
}

/**
 * Inject the currently available {@link SessionService}.
 * @see inject
 */
export function useSession<U>(): SessionService<U> {
  const session = inject(sessionKey)
  if (!session) {
    throw new Error('Missing session provider')
  }
  return session as SessionService<U>
}

class SessionServiceImpl<U> implements SessionService<U> {
  private readonly loading = useLoading<null | U>()

  readonly state = this.loading.state

  readonly isAuthenticated: ComputedRef<boolean> = computed(() => {
    return this.user.value !== null
  })

  readonly user: ComputedRef<null | U> = computed(() => {
    const state = this.state.value
    switch (state.loading) {
      case 'loaded':
        return state.result
      case 'pending':
        return state.previousResult ?? null
      default:
        return null
    }
  })

  constructor(private readonly options: SessionOptions<U>) {}

  refresh(pending: boolean = true): Promise<null | U> {
    const abort = new AbortController()
    return this.loading.load(this.loadSessionUser(abort.signal), { pending, abort })
  }

  login(returnUrl: string = window.location.href): void {
    const { loginUrl } = this.options
    const url = typeof loginUrl === 'function' ? loginUrl(returnUrl) : loginUrl
    this.navigate(String(url))
  }

  async logout(): Promise<void> {
    const url = urlHref(this.options.logoutUrl)
    const method = this.options.logoutMethod ?? 'POST'
    switch (method) {
      case 'GET': {
        this.loading.emplace(null)
        this.navigate(url)
        return
      }
      case 'POST': {
        const csrfToken = await this.options.csrf?.load()
        this.loading.emplace(null)
        submitPostForm(url, csrfToken)
        return
      }
    }
  }

  private async loadSessionUser(signal: AbortSignal): Promise<null | U> {
    try {
      return await this.options.loadUser(signal)
    } catch (error: unknown) {
      if (error instanceof UnauthorizedError) return null
      throw error
    }
  }

  private navigate(url: string) {
    const navigateFn = this.options.navigate ?? defaultNavigate
    navigateFn(url)
  }
}

function submitPostForm(action: string, csrfToken: undefined | CsrfToken) {
  const form = document.createElement('form')
  form.method = 'POST'
  form.action = action
  form.style.display = 'none'
  if (csrfToken) {
    const input = document.createElement('input')
    input.type = 'hidden'
    input.name = csrfToken.parameterName
    input.value = csrfToken.token
    form.append(input)
  }
  document.body.append(form)
  form.submit()
}

function urlHref(url: URL | string): string {
  if (url instanceof URL) return url.href
  else return url
}
