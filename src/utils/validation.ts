/**
 * Validation result:
 * - `true` = Valid
 * - `false` = Invalid
 * - `string` = Invalid reason
 */
export type ValidationResult = boolean | string

/**
 * A validation rule evaluates if a given value is valid, returning a {@link ValidationResult}.
 */
export type ValidationRule<T = unknown> = (value: undefined | T) => ValidationResult

/** A message specifying the reason why a value is invalid, or false for an invalid result without a message. */
export type InvalidMessage = false | string

/**
 * Validation functions apply a {@link ValidationRule} which returns the given
 * {@link InvalidMessage} if the rule fails for a value to be validated.
 */
export type Validation<T = unknown> = (message?: InvalidMessage) => ValidationRule<T>

type Predicate<T> = (value: undefined | T) => boolean

/** Create a validation that checks if a given predicate is satisfied by the value to be validated. */
export const requireThat =
  <T>(predicate: Predicate<T>): Validation<T> =>
  (message = false) => {
    return value => predicate(value) || message
  }

/** Validation that requires a value to be truthy (none of `null`, `false`, `""`, `0` or `undefined`). */
export const isNotEmpty = requireThat(Boolean)

/** Validation that requires a numeric value to be positive, i.e. greater than zero. */
export const isPositive = requireThat<number>(value => {
  return value !== undefined && value > 0
})

/** Validation that requires a numeric value to be negative, i.e. less than zero. */
export const isNegative = requireThat<number>(value => {
  return value !== undefined && value < 0
})

export const requireLength = (between: { min?: number; max?: number }) =>
  requireThat<string>(value => {
    const { min = Number.NEGATIVE_INFINITY, max = Number.POSITIVE_INFINITY } = between
    const length = value?.length || 0
    return min <= length && length <= max
  })

export const requireBetween = (range: { min?: number; max?: number }) =>
  requireThat<number>(value => {
    const { min = Number.NEGATIVE_INFINITY, max = Number.POSITIVE_INFINITY } = range
    return value === undefined || (min <= value && value <= max)
  })

/** Create a validation that requires a string value to match the given regular expression. */
export const requireMatches = (pattern: RegExp) =>
  requireThat<string>(value => {
    return value !== undefined && pattern.test(value)
  })

/** Validation that requires a string to be a valid e-mail address. */
export const isValidEmail = requireMatches(/^[^\s@]+@[^\s@]+\.[^\s@]+$/i)

/** Validation that requires a string to not be empty or blank (whitespace only). */
export const isNotBlank = requireMatches(/\S/)

/**
 * Validation that requires a string to have a valid integer format.
 * @see Number.parseInt
 */
export const isLikeInt = requireMatches(/^[-+]?\d+$/)

/**
 * Validation that requires a string to have a valid float format.
 * @see Number.parseFloat
 */
export const isLikeFloat = requireMatches(/^[+-]?(\d*\.?)\d+$/)

/**
 * Create a conditional rule, only validating if the precondition applies to the value.
 */
export const validateIf =
  <T>(precondition: Predicate<T>, then: ValidationRule<T>): ValidationRule<T> =>
  value =>
    !precondition(value) || then(value)

/** Create a conditional rule, only validating if the string value is not blank */
export const validateIfNotBlank = (then: ValidationRule<string>) => validateIf(notBlank, then)
const notBlank = (x: undefined | string): boolean => x !== undefined && /\S/.test(x)

/** Create a conditional rule, only validating if the string value is not empty */
export const validateIfNotEmpty = (then: ValidationRule<string>) => validateIf(notEmpty, then)
const notEmpty = (x: undefined | string): boolean => x !== undefined && x !== '' && x !== null

/** Create a conditional rule, only validating if the value is not falsy (`false`, `null`, `undefined`, `""`, or `0`). */
export const validateOptional = <T>(then: ValidationRule<T>) => validateIf(Boolean, then)

/**
 * Create a rule validating that a string value has a valid integer format (see {@link isLikeInt}),
 * and validating the parsed integer using the given rule.
 */
export const validateAsInt = (message: InvalidMessage, then: ValidationRule<number>): ValidationRule<string> => {
  return value => {
    const trimmed = value?.trim()
    if (!trimmed || !/^[-+]?\d+$/.test(trimmed)) {
      return message
    } else {
      return then(Number.parseInt(trimmed, 10))
    }
  }
}

/** Create a composite rule that only succeeds if every given sub-rule succeeds. */
export const validateEvery =
  <T>(rules: ReadonlyArray<ValidationRule<T>>): ValidationRule<T> =>
  value => {
    for (const rule of rules) {
      const result = rule(value)
      if (result !== true) {
        return result
      }
    }
    return true
  }

/** Create a composite rule that only succeeds if any of the given sub-rules succeeds. */
export const validateSome =
  <T>(rules: ReadonlyArray<ValidationRule<T>>): ValidationRule<T> =>
  value => {
    const failures: Array<string> = []
    for (const rule of rules) {
      const result = rule(value)
      if (result === true) {
        return true
      } else if (result !== false) {
        failures.push(result)
      }
    }
    return failures.length > 0 ? failures.join(', ') : false
  }
