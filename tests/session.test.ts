// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  addRequestHeader,
  ApiError,
  csrfTokenCookie,
  csrfTokenEndpoint,
  extendCredentials,
  requiresCsrfToken,
  SessionCredentials,
  UnauthorizedError,
} from '@/api'
import { createSession, unwrapResponseJson } from '@/services'
import { deferPromise } from '@/utils'
import { empty, json, mockApi } from './helpers'

const testCsrfToken = {
  token: 'abc',
  headerName: 'X-CSRF-TOKEN',
  parameterName: '_csrf',
} as const

/** Mocked fetch of a CSRF token endpoint, responding with the given responses in order */
function mockCsrfFetch(responses: ReadonlyArray<() => Response>) {
  let index = 0
  return vi.fn<typeof fetch>(async () => {
    const response = responses[index++]
    if (!response) throw new Error('Unexpected CSRF token request')
    return response()
  })
}

const opaqueRedirect = () => ({ type: 'opaqueredirect', status: 0, ok: false }) as Response

describe('SessionCredentials', () => {
  it('includes cookies and does not follow redirects', () => {
    const credentials = new SessionCredentials()
    expect(credentials.isValid()).toBe(true)
    expect(credentials.authenticate({})).toEqual({ credentials: 'include', redirect: 'manual' })
    expect(credentials.authenticate({ redirect: 'follow' })).toMatchObject({ redirect: 'follow' })

    const sameOriginCredentials = new SessionCredentials({ credentials: 'same-origin', redirect: 'follow' })
    expect(sameOriginCredentials.authenticate({})).toEqual({ credentials: 'same-origin', redirect: 'follow' })
  })

  it('sends the CSRF token with state-changing requests only, loading it once', async () => {
    const csrfFetch = mockCsrfFetch([json(testCsrfToken)])
    const csrf = csrfTokenEndpoint('https://example.com/api/csrf', { fetch: csrfFetch })

    const credentials = new SessionCredentials({ csrf })
    const { api, requests } = mockApi([json([]), json({}), json({})], { credentials })

    await api.request('TodoItem')
    expect(csrfFetch).not.toHaveBeenCalled()
    await api.jsonRequest('TodoItem', { title: 'Milk' }, 'POST')
    await api.jsonRequest('TodoItem/1', { title: 'Milk' }, 'PATCH')

    expect(csrfFetch).toHaveBeenCalledTimes(1)
    expect(csrfFetch.mock.calls[0]?.[1]).toMatchObject({ method: 'GET', credentials: 'include' })
    expect(requests.map(request => request.headers.get('X-CSRF-TOKEN'))).toEqual([null, 'abc', 'abc'])
  })

  it('rejects requests if the CSRF token fails to load', async () => {
    const csrfFetch = mockCsrfFetch([empty(500)])
    const csrf = csrfTokenEndpoint('https://example.com/api/csrf', { fetch: csrfFetch })
    const { api, requests } = mockApi([], { credentials: new SessionCredentials({ csrf }) })
    await expect(api.jsonRequest('TodoItem', {}, 'POST')).rejects.toMatchObject({ code: 'http-error', status: 500 })
    expect(requests).toHaveLength(0)
  })

  it('rejects redirected requests as unauthorized', async () => {
    const { api } = mockApi([opaqueRedirect], { credentials: new SessionCredentials() })
    const error = await api.request('TodoItem').then(response => unwrapResponseJson(response).catch(e => e))
    expect(error).toBeInstanceOf(UnauthorizedError)
    expect(error).toMatchObject({ code: 'unauthorized', status: 0, details: { redirected: true } })
  })

  it.each([
    [undefined, false],
    ['GET', false],
    ['get', false],
    ['HEAD', false],
    ['head', false],
    ['OPTIONS', false],
    ['POST', true],
    ['post', true],
    ['PATCH', true],
    ['patch', true],
    ['DELETE', true],
    ['UNKNOWN_METHOD', true],
  ])('requires a CSRF token for method %s: %s', (method, expected) => {
    expect(requiresCsrfToken(method)).toBe(expected)
  })
})

describe('extendCredentials', () => {
  it('applies further authentication, retaining validity, rewriting and preparation', async () => {
    const prepare = vi.fn()
    const credentials = extendCredentials(
      {
        authenticate: init => ({ ...init, credentials: 'include' }),
        rewrite: url => `${String(url)}?rewritten`,
        prepare,
        isValid: () => false,
      },
      addRequestHeader('Accept-Language', 'de'),
    )

    const init = credentials.authenticate({})
    expect(init.credentials).toBe('include')
    expect(new Headers(init.headers).get('Accept-Language')).toBe('de')
    expect(credentials.rewrite?.('https://example.com')).toBe('https://example.com?rewritten')

    await credentials.prepare?.({ method: 'POST' })
    expect(prepare).toHaveBeenCalledWith({ method: 'POST' })
    expect(credentials.isValid()).toBe(false)
  })
})

describe('csrfTokenEndpoint', () => {
  it('shares concurrent requests, and loads the token again on refresh', async () => {
    const csrfFetch = mockCsrfFetch([json(testCsrfToken), json({ ...testCsrfToken, token: 'def' })])

    const csrf = csrfTokenEndpoint(new URL('https://example.com/api/csrf'), { fetch: csrfFetch })
    expect(csrf.current).toBeUndefined()

    const [first, second] = await Promise.all([csrf.load(), csrf.load()])
    expect(first).toEqual(testCsrfToken)
    expect(second).toBe(first)
    expect(csrf.current).toEqual(testCsrfToken)

    await expect(csrf.refresh()).resolves.toMatchObject({ token: 'def' })
    expect(csrf.current?.token).toBe('def')
    expect(csrfFetch).toHaveBeenCalledTimes(2)
  })

  it('discards the token of a request outdated by a refresh', async () => {
    const outdated = deferPromise<Response>()

    let index = 0
    const responses = [() => outdated, async () => json(testCsrfToken)()]
    const csrf = csrfTokenEndpoint('https://example.com/api/csrf', {
      fetch: () => responses[index++]!(),
    })

    const load = csrf.load()
    await csrf.refresh()
    outdated.resolve(json({ ...testCsrfToken, token: 'outdated' })())
    await load
    expect(csrf.current?.token).toBe('abc')
  })

  it('rejects invalid responses, and repeats failed requests', async () => {
    const csrf = csrfTokenEndpoint('https://example.com/api/csrf', {
      fetch: mockCsrfFetch([json({ token: 'abc' }), json({ message: 'access-denied' }, 403), json(testCsrfToken)]),
    })
    await expect(csrf.load()).rejects.toMatchObject({ code: 'csrf-token-invalid', status: 200 })
    await expect(csrf.load()).rejects.toMatchObject({ name: 'ForbiddenError', code: 'access-denied' })
    await expect(csrf.load()).resolves.toEqual(testCsrfToken)
  })
})

describe('csrfTokenCookie', () => {
  afterEach(() => {
    document.cookie = 'XSRF-TOKEN=; expires=Thu, 01 Jan 1970 00:00:00 GMT'
    document.cookie = 'CSRF=; expires=Thu, 01 Jan 1970 00:00:00 GMT'
  })

  it('reads the token from the cookie on each access', async () => {
    const csrf = csrfTokenCookie()
    expect(csrf.current).toBeUndefined()
    await expect(csrf.load()).resolves.toBeUndefined()

    document.cookie = 'XSRF-TOKEN=a%2Bb'
    expect(csrf.current).toEqual({ token: 'a+b', headerName: 'X-XSRF-TOKEN', parameterName: '_csrf' })
    document.cookie = 'XSRF-TOKEN=c'
    await expect(csrf.refresh()).resolves.toMatchObject({ token: 'c' })
  })

  it('uses the configured names', async () => {
    document.cookie = 'CSRF=token'
    const csrf = csrfTokenCookie({ cookieName: 'CSRF', headerName: 'X-CSRF', parameterName: 'csrf' })
    const { api, requests } = mockApi([empty(204)], { credentials: new SessionCredentials({ csrf }) })
    await api.jsonRequest('TodoItem/1', {}, 'DELETE')
    expect(requests[0]?.headers.get('X-CSRF')).toBe('token')
  })
})

describe('createSession', () => {
  interface User {
    readonly name: string
  }

  function sessionOf(loadUser: (signal: AbortSignal) => Promise<User>, logoutMethod?: 'GET' | 'POST') {
    const csrfFetch = mockCsrfFetch([json(testCsrfToken)])
    const csrf = csrfTokenEndpoint('https://example.com/api/csrf', { fetch: csrfFetch })

    const navigate = vi.fn()
    const session = createSession({
      loadUser,
      loginUrl: returnUrl => `https://example.com/api/login?returnTo=${encodeURIComponent(returnUrl)}`,
      logoutUrl: new URL('https://example.com/api/logout'),
      logoutMethod,
      csrf,
      navigate,
    })

    return { session, navigate } as const
  }

  it('loads the session user, retaining it while refreshing', async () => {
    const { session } = sessionOf(async () => ({ name: 'Alice' }))
    expect(session.user.value).toBe(null)
    expect(session.isAuthenticated.value).toBe(false)

    // begin refresh, await resolve
    await expect(session.refresh()).resolves.toEqual({ name: 'Alice' })
    expect(session.user.value).toEqual({ name: 'Alice' })
    expect(session.isAuthenticated.value).toBe(true)

    // begin refresh, don't await resolve (i.e. still pending)
    void session.refresh()
    expect(session.state.value.loading).toBe('pending')
    expect(session.user.value).toEqual({ name: 'Alice' })
  })

  it('resolves null if not authenticated', async () => {
    const { api } = mockApi([empty(401), opaqueRedirect], { credentials: new SessionCredentials() })
    const { session } = sessionOf(signal => {
      return api.request('UserAccount/me', {}, { signal }).then(unwrapResponseJson<User>)
    })

    await expect(session.refresh()).resolves.toBeNull() // HTTP 401
    await expect(session.refresh()).resolves.toBeNull() // HTTP opaque redirect
    expect(session.state.value).toEqual({ loading: 'loaded', result: null })
    expect(session.isAuthenticated.value).toBe(false)
  })

  it('rejects and fails for other errors', async () => {
    const error = new ApiError('http-error', { status: 500 }, { status: 500 })
    const { session } = sessionOf(() => Promise.reject(error))

    await expect(session.refresh()).rejects.toBe(error)
    expect(session.state.value).toEqual({ loading: 'failed', error })
    expect(session.user.value).toBeNull()
  })

  it('aborts outdated refreshes', async () => {
    const signals: Array<AbortSignal> = []
    const { session } = sessionOf(signal => {
      signals.push(signal)
      return deferPromise<User>()
    })

    // only latest request is active
    void session.refresh() // canceled
    void session.refresh() // canceled
    void session.refresh() // still active
    expect(signals.map(signal => signal.aborted)).toEqual([true, true, false])
  })

  it('navigates to the login page', () => {
    const returnUrl = 'https://app.example.com/todo'
    const { session, navigate } = sessionOf(async () => ({ name: 'Alice' }))

    session.login(returnUrl)
    expect(navigate).toHaveBeenCalledWith(`https://example.com/api/login?returnTo=${encodeURIComponent(returnUrl)}`)

    session.login() // implicit -> current window location
    expect(navigate).toHaveBeenLastCalledWith(
      `https://example.com/api/login?returnTo=${encodeURIComponent(window.location.href)}`,
    )
  })

  it('logs out by navigation', async () => {
    const { session, navigate } = sessionOf(async () => ({ name: 'Alice' }), 'GET')

    await session.refresh()
    await session.logout()
    expect(navigate).toHaveBeenCalledWith('https://example.com/api/logout')
    expect(session.state.value).toEqual({ loading: 'loaded', result: null })
  })

  it('logs out by submitting a form with the CSRF token', async () => {
    interface SubmittedForm {
      readonly action: string
      readonly method: string
      readonly data: Record<string, string>
    }

    const submitSpy = vi.spyOn(HTMLFormElement.prototype, 'submit')

    const submitted: Array<SubmittedForm> = []
    const submit = submitSpy.mockImplementation(function (this: HTMLFormElement) {
      const entries = Array.from(this.elements, element => {
        const input = element as HTMLInputElement
        return [input.name, input.value] as const
      })
      submitted.push({
        action: this.action,
        method: this.method.toLowerCase(),
        data: Object.fromEntries(entries),
      })
    })

    try {
      const { session, navigate } = sessionOf(async () => ({ name: 'Alice' }))
      await session.refresh()

      await session.logout()
      expect(navigate).not.toHaveBeenCalled()
      expect(session.user.value).toBeNull()
      expect(submitted).toEqual([
        {
          action: 'https://example.com/api/logout',
          method: 'post',
          data: { _csrf: 'abc' },
        },
      ])
    } finally {
      submit.mockRestore()
    }
  })
})
