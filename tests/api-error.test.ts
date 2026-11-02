import { describe, expect, it } from 'vitest'
import {
  ApiError,
  CredentialsInvalid,
  EntityNotFound,
  ForbiddenError,
  UnauthorizedError,
  UsernamePassword,
} from '@/api'

describe('ApiError', () => {
  it('formats its message from code and details', () => {
    expect(new ApiError('boom').message).toBe('boom')
    expect(new ApiError('boom', { a: 1, b: { c: [2] }, d: null }).message).toBe('boom {a = 1, b = {"c":[2]}, d = null}')
  })

  it('is an Error with name, status, error type and cause', () => {
    const cause = new Error('cause')
    const error = new ApiError('boom', {}, { status: 418, errorType: 'Teapot', cause })
    expect(error).toBeInstanceOf(Error)
    expect(error).toMatchObject({ name: 'ApiError', status: 418, errorType: 'Teapot', cause })
  })

  it('creates nested errors from valid entries of the "errors" detail', () => {
    const error = new ApiError(
      'entity-body-invalid',
      { errors: [{ code: 'a', args: { x: 1 } }, { code: 'b' }, { args: {} }, 'c', null] },
      { status: 400 },
    )
    expect(error.errors.map(e => [e.code, e.details, e.status])).toEqual([
      ['a', { x: 1 }, 400],
      ['b', {}, 400],
    ])
    expect(new ApiError('a', { errors: 'none' }).errors).toEqual([])
  })
})

describe('ApiError.fromResponse', () => {
  const body = { message: 'entity-not-found', arguments: { id: '1' }, errorType: 'de.kiwi.api.domain.EntityNotFound' }

  it('uses the Kiwi error body', () => {
    const error = ApiError.fromResponse(404, body)
    expect(error).toMatchObject({ code: 'entity-not-found', details: { id: '1' }, status: 404 })
    expect(error.errorType).toBe('de.kiwi.api.domain.EntityNotFound')
  })

  it('creates errors by status for 401 and 403', () => {
    expect(ApiError.fromResponse(401, '')).toBeInstanceOf(UnauthorizedError)
    expect(ApiError.fromResponse(401, '')).toMatchObject({ name: 'UnauthorizedError', code: 'unauthorized' })
    expect(ApiError.fromResponse(403, undefined)).toMatchObject({ name: 'ForbiddenError', code: 'forbidden' })
    expect(ApiError.fromResponse(403, { ...body, message: 'access-denied' })).toBeInstanceOf(ForbiddenError)
  })

  it('falls back to a generic error', () => {
    expect(ApiError.fromResponse(500, { error: 'Internal Server Error' })).toMatchObject({
      code: 'http-error',
      details: { status: 500 },
    })
    expect(ApiError.fromResponse(500, 42)).toMatchObject({ code: 'http-error' })
    expect(ApiError.fromResponse(500, '   ')).toMatchObject({ code: 'http-error' })
  })
})

describe('ApiError subclasses', () => {
  it('describes missing entities', () => {
    expect(new EntityNotFound('TodoItem', '1')).toMatchObject({
      code: 'entity-not-found',
      details: { entityType: 'TodoItem', id: '1' },
      status: 404,
    })
  })

  it('does not expose credentials in details or message', () => {
    const credentials = new UsernamePassword('user', 'secret')
    const error = new CredentialsInvalid(credentials)
    expect(error.credentials).toBe(credentials)
    expect(error.details).toEqual({})
    expect(error.message).not.toContain('secret')
  })
})
