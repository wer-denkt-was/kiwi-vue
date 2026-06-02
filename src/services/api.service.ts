import { MaybeRefOrGetter } from 'vue'
import { ApiCredentials } from '@/api/credentials.model'
import { Accelerated, decelerate } from '@/utils/decelerator'
import { ApiError, CredentialsInvalid, ForbiddenError } from '@/api'

export type ParamValue = null | undefined | string | number | boolean
export type ParamValues = ParamValue | ReadonlyArray<ParamValue>
export type RequestParams = Record<string, ParamValues>

/**
 * Interface for communicating with a remote API.
 * This API may add request headers like credentials for authentication before sending the request,
 * or may post-process the received response before returning it.
 */
export interface Api {
  /** Base URL of API */
  readonly baseUrl: Readonly<URL>

  /** Execute an HTTP request against an endpoint path with parameters */
  request(path: string, params: RequestParams, init: RequestInit): Promise<Response>

  /** Execute an HTTP request against an absolute or relative (to {@link baseUrl}) URL */
  request(input: URL, init: RequestInit): Promise<Response>

  /** Execute an HTTP POST/PUT request with a JSON request body */
  jsonRequest(path: string, body: object, method: 'PUT' | 'POST'): Promise<Response>
}

const apiKey = Symbol('api') as InjectionKey<Api>

export interface ApiOptions {
  apiUrl: string | URL
  credentials: MaybeRefOrGetter<ApiCredentials>
}

/**
 * Create and provide an {@link Api} instance in the current context.
 */
export function provideApi(options: ApiOptions): Api {
  const api = new FetchApi(options.apiUrl, (input, init) => {
    const credentials = toValue(options.credentials)
    if (!credentials.isValid()) {
      throw new CredentialsInvalid(credentials)
    }
    const processedInput = credentials.rewrite?.(input) ?? input
    const processedInit = credentials.authenticate(init)
    return [processedInput, processedInit]
  })
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
 */
export async function unwrapResponseJson<R>(response: Response, accelerated: undefined | boolean = false): Promise<R> {
  if (response.ok) {
    const responseBody = await response.json()
    return unwrapResponseJsonBody<R>(responseBody, accelerated)
  } else if (response.status === 403) {
    throw new ForbiddenError() // HTTP Forbidden does not have a response body
  } else {
    const responseBody = await response.json()
    throw unwrapResponseError(responseBody)
  }
}

function unwrapResponseJsonBody<R>(responseBody: unknown, accelerated: undefined | boolean): R {
  if (!accelerated) {
    return responseBody as R
  } else {
    return decelerate(responseBody as Accelerated) as R
  }
}

function unwrapResponseError(errorBody: unknown): ApiError {
  // Handle string error
  if (typeof errorBody === 'string') {
    return new ApiError(errorBody, {})
  }
  // Handle error response object with message and arguments from API
  if (typeof errorBody === 'object' && errorBody !== null) {
    const message = 'message' in errorBody ? String(errorBody.message) : '<unknown>'
    const details = 'arguments' in errorBody ? errorBody.arguments : {}
    return new ApiError(message, details as Record<string, unknown>)
  }
  // Handle other errors
  return new ApiError(String(errorBody), { responseType: typeof errorBody })
}

type RequestInput = string | URL

interface RequestPreprocessor {
  (input: RequestInput, init: RequestInit): readonly [RequestInput, RequestInit]
}

export class FetchApi implements Api {
  readonly baseUrl: URL

  constructor(
    private readonly base: RequestInput,
    private readonly requestPreprocessor: RequestPreprocessor,
  ) {
    this.baseUrl = new URL(this.base)
  }

  jsonRequest(path: RequestInput, body: object, method: 'PUT' | 'POST'): Promise<Response> {
    const jsonHeaders = { 'Content-Type': 'application/json' }
    return this.request(path, {}, { method, body: JSON.stringify(body), headers: jsonHeaders })
  }

  request(input: URL, init: RequestInit): Promise<Response>
  request(path: RequestInput, params: RequestParams, init: RequestInit): Promise<Response>
  request(
    pathOrUrl: RequestInput,
    initOrParams: RequestInit | RequestParams,
    maybeInit?: RequestInit,
  ): Promise<Response> {
    if (maybeInit) {
      const path = pathOrUrl as string
      const params = initOrParams as RequestParams
      const url = new URL(endpoint(path, params), this.base)
      return this.processAndFetch(url, maybeInit)
    } else {
      const url = pathOrUrl instanceof URL ? pathOrUrl : new URL(pathOrUrl, this.base)
      const init = initOrParams as RequestInit
      return this.processAndFetch(url, init)
    }
  }

  private processAndFetch(url: URL, init: RequestInit): Promise<Response> {
    const [processedInput, processedInit] = this.requestPreprocessor(url, init)
    return fetch(processedInput, processedInit)
  }
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

  const search = query.toString()
  return search ? `${path}?${search}` : path
}
