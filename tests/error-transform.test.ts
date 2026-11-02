import { describe, expect, it, vi } from 'vitest'
import {
  findErrorMessageKey,
  i18nErrorTransformer,
  resourceErrorTransformer,
  simpleApiErrorTransformer,
} from '@/services'
import { ApiError } from '@/api'

const notFound = new ApiError('entity-not-found', { entityType: 'de.kiwi.demo.TodoItem', id: '42' })

const bodyInvalid = new ApiError('entity-body-invalid', {
  entityType: 'de.kiwi.demo.TodoItem',
  errors: [
    { code: 'entity-field-missing-value', args: { fieldName: 'title' } },
    { code: 'entity-field-invalid', args: { fieldName: 'order', reason: 'invalid-value' } },
  ],
})

describe('findErrorMessageKey', () => {
  it('prefers the most specific matching key', () => {
    const keys = [
      'entity-not-found',
      'entity-not-found[entityType=de.kiwi.demo.TodoItem]',
      'entity-not-found[entityType=de.kiwi.demo.TodoItem,id=42]',
      'entity-not-found[entityType=de.kiwi.demo.TodoList,id=42]',
    ]
    expect(findErrorMessageKey(notFound, keys)).toBe('entity-not-found[entityType=de.kiwi.demo.TodoItem,id=42]')
  })

  it('compares codes and values case-insensitively, and supports "&" separators', () => {
    expect(findErrorMessageKey(notFound, ['Entity-Not-Found[entityType=DE.KIWI.DEMO.TODOITEM&id=42]'])).toBe(
      'Entity-Not-Found[entityType=DE.KIWI.DEMO.TODOITEM&id=42]',
    )
  })

  it('requires conditional details to be present', () => {
    expect(findErrorMessageKey(notFound, ['entity-not-found[reason]'])).toBeUndefined()
    expect(findErrorMessageKey(notFound, ['entity-not-found[id]'])).toBe('entity-not-found[id]')
  })
})

describe('resourceErrorTransformer', () => {
  it('formats messages with placeholders', () => {
    const transform = resourceErrorTransformer({
      'entity-not-found': 'Not found: {{ id }}',
      'entity-not-found[entityType=de.kiwi.demo.TodoItem]': 'Todo item {{ID}} not found',
    })
    expect(transform(notFound).formattedMessage).toBe('Todo item 42 not found')
  })

  it('transforms nested errors into causes, joining their messages if the error has no message', () => {
    const transform = resourceErrorTransformer({
      'entity-field-missing-value': '{{fieldName}} is required',
      'entity-field-invalid[fieldName=order]': 'Invalid order',
    })
    const details = transform(bodyInvalid)
    expect(details.causes?.map(cause => cause.formattedMessage)).toEqual(['title is required', 'Invalid order'])
    expect(details.formattedMessage).toBe('title is required\nInvalid order')
  })

  it('falls back to the raw message for unknown codes', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const details = resourceErrorTransformer({})(notFound)
    expect(details.formattedMessage).toBe('entity-not-found {entityType = de.kiwi.demo.TodoItem, id = 42}')
  })
})

describe('i18nErrorTransformer', () => {
  it('resolves messages by key with details as named arguments', () => {
    const messages: Record<string, Record<string, string>> = {
      errors: {
        'entity-not-found': 'Not found',
        'entity-not-found[entityType=de.kiwi.demo.TodoItem,id]': 'Todo item {id} not found',
      },
    }
    const transform = i18nErrorTransformer({
      tm: key => messages[key],
      rt: (message: string, named) => message.replace(/\{(\w+)}/g, (_, name) => String(named?.[name])),
      messagesKey: 'errors',
    })
    expect(transform(notFound).formattedMessage).toBe('Todo item 42 not found')
    expect(transform(new Error('Boom')).formattedMessage).toBe('Boom')
  })
})

describe('simpleApiErrorTransformer', () => {
  it('formats non-error values', () => {
    expect(simpleApiErrorTransformer(undefined).formattedMessage).toBe('undefined')
    expect(simpleApiErrorTransformer({ a: 1 }).formattedMessage).toBe('{"a":1}')
  })
})
