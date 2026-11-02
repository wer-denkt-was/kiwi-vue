import type { ApiError } from '@/api'

/**
 * Key of an error message, matching {@link ApiError}s by their code and details.
 *
 * Key format: either `code` matching all errors with this code, or `code[conditions]` additionally matching the
 * error details. Conditions are separated by `,` (or `&`), each is either `name=value` requiring the detail `name`
 * to equal `value`, or `name` requiring the detail `name` to be present. Codes and values are compared
 * case-insensitively, ignoring surrounding whitespace.
 * @example
 * 'entity-not-found'
 * 'entity-not-found[entityType=de.kiwi.demo.domain.TodoItem]'
 * 'entity-field-invalid[fieldName=title,reason]'
 */
export interface ErrorMessageKey {
  /** Original key */
  readonly key: string
  /** Lowercase error code */
  readonly code: string
  /** Number of conditions, keys with more conditions take precedence */
  readonly specificity: number

  matches(error: ApiError): boolean
}

type Condition = readonly [name: string, expectedValue: undefined | string]

const keyRegex = /^(?<code>[^[]+)(?:\[(?<conditions>[^\]]*)])?$/
const keyCache = new Map<string, null | ErrorMessageKey>()

/** Parse an {@link ErrorMessageKey}, returning `null` for keys that are not in a valid format */
export function parseErrorMessageKey(key: string): null | ErrorMessageKey {
  const cached = keyCache.get(key)
  if (cached !== undefined) return cached

  const parsed = parseUncached(key)
  keyCache.set(key, parsed)
  return parsed
}

/** Find the most specific key matching the given error, or `undefined` if no key matches */
export function findErrorMessageKey(error: ApiError, keys: Iterable<string>): undefined | string {
  let found: undefined | ErrorMessageKey
  for (const key of keys) {
    const parsed = parseErrorMessageKey(key)
    if (parsed && (!found || parsed.specificity > found.specificity) && parsed.matches(error)) {
      found = parsed
    }
  }
  return found?.key
}

function parseUncached(key: string): null | ErrorMessageKey {
  const match = key.trim().match(keyRegex)
  const code = match?.groups?.code?.trim().toLowerCase()
  if (!code) return null

  const conditions = parseConditions(match?.groups?.conditions ?? '')
  return {
    key,
    code,
    specificity: conditions.length,
    matches: error => error.code.toLowerCase() === code && conditions.every(c => conditionMatches(c, error.details)),
  }
}

function parseConditions(conditions: string): Array<Condition> {
  return conditions
    .split(/[,&]/)
    .map(condition => condition.trim())
    .filter(condition => condition !== '')
    .map(condition => {
      const separator = condition.indexOf('=')
      if (separator < 0) return [condition, undefined] as const
      const name = condition.slice(0, separator).trim()
      const expectedValue = normalizeValue(condition.slice(separator + 1))
      return [name, expectedValue] as const
    })
}

function conditionMatches([name, expectedValue]: Condition, details: Readonly<Record<string, unknown>>): boolean {
  if (!(name in details)) return false
  return expectedValue === undefined || normalizeValue(details[name]) === expectedValue
}

function normalizeValue(value: unknown): string {
  if (value === null || value === undefined) return ''
  const text = typeof value === 'object' ? JSON.stringify(value) : String(value)
  return text.trim().toLowerCase()
}
