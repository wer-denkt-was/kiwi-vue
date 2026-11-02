import { describe, expect, it } from 'vitest'
import {
  isLikeFloat,
  isLikeInt,
  isNegative,
  isNotBlank,
  isNotEmpty,
  isPositive,
  isValidEmail,
  requireBetween,
  requireLength,
  requireThat,
  validateAsInt,
  validateEvery,
  validateIfNotBlank,
  validateIfNotEmpty,
  validateOptional,
  validateSome,
} from '@/utils'

describe('validations', () => {
  it('return true if valid, or the message otherwise', () => {
    expect(isNotEmpty('Required')('x')).toBe(true)
    expect(isNotEmpty('Required')('')).toBe('Required')
    expect(isNotEmpty()(0)).toBe(false)
    expect(requireThat<number>(x => x === 42)('Not 42')(41)).toBe('Not 42')
  })

  it.each([
    [isPositive(), [1, 0.1], [0, -1, undefined]],
    [isNegative(), [-1], [0, 1, undefined]],
    [isNotBlank(), ['a', ' a '], ['', '  ', undefined]],
    [isValidEmail(), ['a@b.de'], ['a@b', 'a b@c.de', undefined]],
    [isLikeInt(), ['1', '-12', '+3'], ['1.5', '1e3', '12abc', '']],
    [isLikeFloat(), ['1', '-1.5', '.5'], ['1.', 'abc', '1,5']],
    [requireLength({ min: 2, max: 3 })(), ['ab', 'abc'], ['a', 'abcd', undefined]],
    [requireBetween({ min: 1, max: 3 })(), [1, 3, undefined], [0, 4]],
  ] as const)('%#: validates valid and invalid values', (rule, valid, invalid) => {
    const validate = rule as (value: unknown) => unknown
    valid.forEach(value => expect(validate(value), String(value)).toBe(true))
    invalid.forEach(value => expect(validate(value), String(value)).toBe(false))
  })

  it('validates strings as integers', () => {
    const rule = validateAsInt('No integer', isPositive('Not positive'))
    expect(rule(' 12 ')).toBe(true)
    expect(rule('-1')).toBe('Not positive')
    expect(rule('12abc')).toBe('No integer')
    expect(rule('1.5')).toBe('No integer')
    expect(rule('')).toBe('No integer')
    expect(rule(undefined)).toBe('No integer')
  })

  it('validates conditionally', () => {
    const email = isValidEmail('Invalid')
    expect(validateIfNotBlank(email)('  ')).toBe(true)
    expect(validateIfNotBlank(email)('x')).toBe('Invalid')
    expect(validateIfNotEmpty(email)('')).toBe(true)
    expect(validateIfNotEmpty(email)(' ')).toBe('Invalid')
    expect(validateOptional(isPositive('Not positive'))(0)).toBe(true)
    expect(validateOptional(isPositive('Not positive'))(-1)).toBe('Not positive')
  })

  it('combines rules', () => {
    const every = validateEvery([isNotBlank('Blank'), requireLength({ max: 3 })('Too long')])
    expect(every('abc')).toBe(true)
    expect(every('')).toBe('Blank')
    expect(every('abcd')).toBe('Too long')

    const some = validateSome([isLikeInt('No int'), isValidEmail('No email'), isNotEmpty()])
    expect(some('1')).toBe(true)
    expect(some('x')).toBe(true)
    expect(validateSome([isLikeInt('No int'), isValidEmail('No email')])('x')).toBe('No int, No email')
    expect(validateSome([isLikeInt(), isValidEmail()])('x')).toBe(false)
  })
})
