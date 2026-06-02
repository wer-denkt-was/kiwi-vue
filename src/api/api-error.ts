import type { ApiCredentials } from './credentials.model.ts'

/**
 * Enriched `Error` that may be thrown when processing an {@link Api} response,
 * containing an error code and details.
 * @see Error
 */
export class ApiError extends Error {
  constructor(
    public readonly code: string,
    public readonly details: Record<string, unknown>,
  ) {
    const args = Object.entries(details).map(([key, value]) => `${key} = ${value}`)
    const message = args.length === 0 ? code : `${code} {${args.join(', ')}}`
    super(message)
  }
}

export class ForbiddenError extends ApiError {
  constructor() {
    super('forbidden', {})
  }
}

export class EntityNotFound extends ApiError {
  constructor(entityType: string, id: string) {
    super('entity-not-found', { entityType, id })
  }
}

export class CredentialsInvalid extends ApiError {
  constructor(readonly credentials: ApiCredentials) {
    super('credentials-invalid', { credentials })
  }
}
