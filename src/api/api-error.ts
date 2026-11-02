import type { ApiCredentials } from './credentials.model.ts'

/**
 * JSON body of an error response sent by a Kiwi-Server application
 * @property message Machine-readable error code, e.g. `entity-not-found`
 * @property arguments Details of the error, depending on the error code
 * @property errorType Type of the error, usually the fully qualified exception class name
 */
export interface ApiErrorBody {
  readonly message: string
  readonly arguments?: Readonly<Record<string, unknown>>
  readonly errorType?: string
}

/**
 * Additional information about an {@link ApiError}
 * @property status HTTP status code of the response the error was created from
 * @property errorType Type of the error reported by the server, see {@link ApiErrorBody.errorType}
 * @property cause Underlying cause of the error
 */
export interface ApiErrorOptions {
  readonly status?: number
  readonly errorType?: string
  readonly cause?: unknown
}

/**
 * Enriched `Error` that may be thrown when processing an {@link Api} response,
 * containing an error code and details.
 * @see Error
 */
export class ApiError extends Error {
  /** HTTP status code of the response, if this error was created from an HTTP response */
  readonly status?: number

  /** Type of the error reported by the server, usually the fully qualified exception class name */
  readonly errorType?: string

  /**
   * Nested errors contained in the `errors` detail, e.g. the field errors of an `entity-body-invalid` error,
   * which lists each invalid, missing or unknown field of a request body as `{ code, args }`.
   */
  readonly errors: ReadonlyArray<ApiError>

  constructor(
    public readonly code: string,
    public readonly details: Readonly<Record<string, unknown>> = {},
    options: ApiErrorOptions = {},
  ) {
    super(formatErrorMessage(code, details), { cause: options.cause })
    this.name = 'ApiError'
    this.status = options.status
    this.errorType = options.errorType
    this.errors = nestedErrors(details.errors, options.status)
  }

  /**
   * Create an {@link ApiError} from the status and the parsed body of an HTTP error response.
   * The body is expected to be an {@link ApiErrorBody}, other bodies result in a generic error by status.
   * Responses with status `401` result in an {@link UnauthorizedError}, `403` in a {@link ForbiddenError}.
   */
  static fromResponse(status: number, body: unknown): ApiError {
    const errorBody = isApiErrorBody(body) ? body : undefined
    if (status === 401) return new UnauthorizedError(errorBody)
    if (status === 403) return new ForbiddenError(errorBody)
    if (errorBody) return fromErrorBody(errorBody, status)
    if (typeof body === 'string' && body.trim()) return new ApiError(body.trim(), {}, { status })
    return new ApiError('http-error', { status }, { status })
  }
}

/**
 * Error of a request without valid authentication, i.e. HTTP `401 Unauthorized`, or a redirect (to a login page) of a
 * request that does not follow redirects. The code is taken from the response body if the server sent one,
 * and is `unauthorized` otherwise. Redirects have the status `0` and the detail `redirected: true`.
 * @see SessionCredentials
 */
export class UnauthorizedError extends ApiError {
  constructor(body?: ApiErrorBody, status: number = 401) {
    const details = body?.arguments ?? (status === 0 ? { redirected: true } : {})
    super(body?.message ?? 'unauthorized', details, { status, errorType: body?.errorType })
    this.name = 'UnauthorizedError'
  }
}

/**
 * Error of a request that is not permitted, i.e. HTTP `403 Forbidden`.
 * The code is taken from the response body if the server sent one (e.g. `access-denied` for Spring Security's
 * `AccessDeniedException`, or the code of a `DomainException`), and is `forbidden` otherwise.
 */
export class ForbiddenError extends ApiError {
  constructor(body?: ApiErrorBody) {
    super(body?.message ?? 'forbidden', body?.arguments, { status: 403, errorType: body?.errorType })
    this.name = 'ForbiddenError'
  }
}

export class EntityNotFound extends ApiError {
  constructor(entityType: string, id: string) {
    super('entity-not-found', { entityType, id }, { status: 404 })
    this.name = 'EntityNotFound'
  }
}

export class CredentialsInvalid extends ApiError {
  constructor(readonly credentials: ApiCredentials) {
    super('credentials-invalid', {})
    this.name = 'CredentialsInvalid'
  }
}

function isApiErrorBody(body: unknown): body is ApiErrorBody {
  return typeof body === 'object' && body !== null && 'message' in body && typeof body.message === 'string'
}

function fromErrorBody(body: ApiErrorBody, status?: number): ApiError {
  return new ApiError(body.message, body.arguments ?? {}, { status, errorType: body.errorType })
}

function nestedErrors(errors: unknown, status: undefined | number): ReadonlyArray<ApiError> {
  if (!Array.isArray(errors)) return []
  return errors
    .filter((error): error is { code: string; args?: unknown } => {
      return typeof error === 'object' && error !== null && typeof error.code === 'string'
    })
    .map(error => {
      const args = typeof error.args === 'object' && error.args !== null ? (error.args as Record<string, unknown>) : {}
      return new ApiError(error.code, args, { status })
    })
}

function formatErrorMessage(code: string, details: Readonly<Record<string, unknown>>): string {
  const args = Object.entries(details).map(([key, value]) => `${key} = ${formatDetailValue(value)}`)
  return args.length === 0 ? code : `${code} {${args.join(', ')}}`
}

function formatDetailValue(value: unknown): string {
  if (typeof value !== 'object' || value === null) return String(value)
  try {
    return JSON.stringify(value)
  } catch {
    return String(value)
  }
}
