import { MaybeRefOrGetter } from 'vue'
import { ApiCredentials } from '@/api/credentials.model'
import { Accelerated, decelerate } from '@/utils/decelerator'
import { ApiError, CredentialsInvalid, UnauthorizedError } from '@/api'

export type ParamValue = null | undefined | string | number | boolean
export type ParamValues = ParamValue | ReadonlyArray<ParamValue>
export type RequestParams = Readonly<Record<string, ParamValues>>

/** HTTP methods of requests with a JSON body */
export type JsonRequestMethod = 'POST' | 'PUT' | 'PATCH' | 'DELETE'

/** Application header for specifying Content-Type: application/json */
export const contentTypeJson = { 'Content-Type': 'application/json' } as const

/**
 * Interface for communicating with a remote API.
 * This API may add request headers like credentials for authentication before sending the request,
 * or may post-process the received response before returning it.
 */
export interface Api {
  /** Base URL of API, always ending with a slash */
  readonly baseUrl: Readonly<URL>

  /**
   * Execute an HTTP request against an endpoint path with query parameters.
   * The path is resolved relative to {@link baseUrl}, leading slashes are ignored:
   * with the base URL `https://example.com/api/`, the path `/TodoItem` requests `https://example.com/api/TodoItem`.
   */
  request(path: string, params?: RequestParams, init?: RequestInit): Promise<Response>

  /** Execute an HTTP request against an absolute URL */
  request(input: URL, init?: RequestInit): Promise<Response>

  /** Execute an HTTP request with a JSON request body against an endpoint path with query parameters */
  jsonRequest(
    path: string,
    body: unknown,
    method: JsonRequestMethod,
    params?: RequestParams,
    init?: RequestInit,
  ): Promise<Response>
}

const apiKey = Symbol('api') as InjectionKey<Api>

export interface ApiOptions {
  /** Base URL of the API, a trailing slash is appended if missing */
  apiUrl: string | URL
  /** Credentials authenticating each request, evaluated for each request */
  credentials: MaybeRefOrGetter<ApiCredentials>
  /** Fetch implementation used to execute requests, defaults to the global `fetch` */
  fetch?: typeof fetch
}

/**
 * Create an {@link Api} instance, e.g. for usage outside of components.
 * @see provideApi
 */
export function createApi(options: ApiOptions): Api {
  return new FetchApi(options.apiUrl, options.fetch, async (input, init) => {
    const credentials = toValue(options.credentials)
    if (!credentials.isValid()) {
      throw new CredentialsInvalid(credentials)
    }
    await credentials.prepare?.(init)
    const processedInput = credentials.rewrite?.(input) ?? input
    const processedInit = credentials.authenticate(init)
    return [processedInput, processedInit]
  })
}

/**
 * Provide an {@link Api} instance in the current context, either the given instance,
 * or a new instance created from the given {@link ApiOptions}.
 */
export function provideApi(apiOrOptions: Api | ApiOptions): Api {
  const api = 'request' in apiOrOptions ? apiOrOptions : createApi(apiOrOptions)
  provide(apiKey, api)
  return api
}

/**
 * Inject the currently available {@link Api} instance.
 * @see inject
 */
export function useApi(): Api {
  const api = inject(apiKey)
  if (!api) {
    throw new Error('Missing api provider')
  }
  return api
}

interface ServiceConstructor<S> {
  new (api: Api): S
}

/**
 * Construct a service using the currently available {@link Api} instance.
 */
export function useApiService<S>(service: ServiceConstructor<S>): S {
  const api = useApi()
  return new service(api)
}

/**
 * Utility function for unwrapping an {@link Api} JSON {@link Response},
 * either resolving the response JSON body or throwing an {@link ApiError} if the response indicates an error status.
 * An empty response body (e.g. `204 No Content`) resolves to `undefined`. A response body that is not valid JSON,
 * e.g. an HTML page of a misconfigured proxy or development server, rejects with the error code `response-not-json`.
 */
export async function unwrapResponseJson<R>(response: Response, accelerated: undefined | boolean = false): Promise<R> {
  if (!response.ok) {
    throw await readResponseError(response)
  }
  const responseText = await response.text()
  const responseBody = responseText ? parseResponseJson(response, responseText) : undefined
  return accelerated && responseBody !== undefined
    ? (decelerate(responseBody as Accelerated) as R)
    : (responseBody as R)
}

/**
 * Read the body of an HTTP error response, and convert it into an {@link ApiError}.
 * Kiwi-Server error responses contain a JSON body with an error code (`message`), `arguments` and an `errorType`.
 * Responses without such a body (e.g. errors of a proxy, or of Spring Security filters) result in an error by status.
 * Redirects of requests that don't follow redirects (`redirect: 'manual'`, e.g. of {@link SessionCredentials}) are
 * considered redirects to a login page, and result in an {@link UnauthorizedError}.
 * @see ApiError.fromResponse
 */
export async function readResponseError(response: Response): Promise<ApiError> {
  if (response.type === 'opaqueredirect') {
    return new UnauthorizedError(undefined, response.status)
  }
  const responseText = await response.text().catch(() => '')
  return ApiError.fromResponse(response.status, parseJsonOrText(responseText))
}

function parseResponseJson(response: Response, text: string): unknown {
  try {
    return JSON.parse(text)
  } catch (cause: unknown) {
    const { status } = response
    const contentType = response.headers.get('Content-Type')
    throw new ApiError('response-not-json', { status, contentType }, { status, cause })
  }
}

function parseJsonOrText(text: string): unknown {
  try {
    return JSON.parse(text)
  } catch {
    return text
  }
}

type RequestInput = string | URL

interface RequestPreprocessor {
  (input: RequestInput, init: RequestInit): RequestPreprocessorResult | Promise<RequestPreprocessorResult>
}

type RequestPreprocessorResult = readonly [RequestInput, RequestInit]

export class FetchApi implements Api {
  readonly baseUrl: URL

  constructor(
    base: RequestInput,
    private readonly fetchFn: typeof fetch = (input, init) => fetch(input, init),
    private readonly requestPreprocessor: RequestPreprocessor = (input, init) => [input, init] as const,
  ) {
    this.baseUrl = withTrailingSlash(base)
  }

  jsonRequest(
    path: string,
    body: unknown,
    method: JsonRequestMethod,
    params: RequestParams = {},
    init: RequestInit = {},
  ): Promise<Response> {
    const headers = new Headers(init.headers)
    headers.set('Content-Type', contentTypeJson['Content-Type'])
    return this.request(path, params, { ...init, method, headers, body: JSON.stringify(body) })
  }

  request(input: URL, init?: RequestInit): Promise<Response>
  request(path: string, params?: RequestParams, init?: RequestInit): Promise<Response>
  request(pathOrUrl: RequestInput, initOrParams?: RequestInit | RequestParams, maybeInit?: RequestInit) {
    if (pathOrUrl instanceof URL) {
      return this.processAndFetch(pathOrUrl, (initOrParams ?? {}) as RequestInit)
    } else {
      const params = (initOrParams ?? {}) as RequestParams
      const url = new URL(endpoint(pathOrUrl, params), this.baseUrl)
      return this.processAndFetch(url, maybeInit ?? {})
    }
  }

  private async processAndFetch(url: URL, init: RequestInit): Promise<Response> {
    const [processedInput, processedInit] = await this.requestPreprocessor(url, init)
    return this.fetchFn(processedInput, processedInit)
  }
}

function withTrailingSlash(input: RequestInput): URL {
  const url = new URL(input)
  if (!url.pathname.endsWith('/')) {
    url.pathname = `${url.pathname}/`
  }
  return url
}

function isParamValue(value: unknown): value is NonNullable<ParamValue> {
  return typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean'
}

function endpoint(path: string, params: RequestParams): string {
  const query = new URLSearchParams()
  Object.entries(params).forEach(([name, value]) => {
    if (isParamValue(value)) {
      query.append(name, String(value))
    } else if (value !== null && value !== undefined) {
      for (const item of value) {
        if (isParamValue(item)) {
          query.append(name, String(item))
        }
      }
    }
  })

  // Paths are relative to the base URL, leading slashes would resolve them against the origin
  const relativePath = path.replace(/^\/+/, '')
  const search = query.toString()
  return search ? `${relativePath}?${search}` : relativePath
}
