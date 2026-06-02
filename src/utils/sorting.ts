/**
 * Ordinal representing the result of a comparison produced by a {@link Compare} function.
 * - LT "less than" = -1
 * - EQ "equal" = 0
 * - GT "greater than" = +1
 */
export const enum Ordinal {
  LT = -1,
  EQ = 0,
  GT = +1,
}

/** Create a function for sorting arrays using the given {@link Compare} function. */
export const sorting =
  <T>(compare?: Compare<T>) =>
  (array: ReadonlyArray<T>) =>
    [...array].sort(compare)

/**
 * Function comparing to items to define a sort order.
 * The return value is a number whose sign indicates the relative order of the two elements:
 * negative if `a` is less than `b`, positive if `a` is greater than `b`, and zero if they are equal.
 */
export type Compare<T> = (a: T, b: T) => Ordinal

// eslint-disable-next-line @typescript-eslint/no-namespace
export namespace Compare {
  /** Compare two values using the JS-native greater-than `>` and less-than `<` operators. */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  export const natural: Compare<any> = (a, b) => (a > b ? Ordinal.GT : a < b ? Ordinal.LT : Ordinal.EQ)

  /** Compare two numbers by subtracting `b` from `a`. */
  export const number: Compare<number> = (a, b) => a - b

  const baseSensitivity = { sensitivity: 'base' } as const

  /** Compare two strings case-insensitively. */
  export const caseInsensitive: Compare<string> = (a, b) => a.localeCompare(b, undefined, baseSensitivity)

  type Reverse = <T>(compare?: Compare<T>) => Compare<T>
  /** Reverse a given comparator by passing the items to be compared in inverse order. */
  export const reverse: Reverse =
    (compare = natural) =>
    (a, b) =>
      compare(b, a)

  type ByKey = <T, K extends keyof T = keyof T>(key: K, compare?: Compare<T[K]>) => Compare<T>
  /** Compare values by comparing the values associated with the given key using the given downstream comparator. */
  export const byKey: ByKey =
    (key, compare = natural) =>
    (a, b) =>
      compare(a[key], b[key])

  type CompareBy = <T, R = unknown>(by: (item: T) => R, compare?: Compare<R>) => Compare<T>
  /** Compare values by comparing the values produced by the given function using the given downstream comparator. */
  export const compareBy: CompareBy =
    (by, compare = natural) =>
    (a, b) =>
      compare(by(a), by(b))

  type Compose = <T>(...comparators: ReadonlyArray<Compare<T>>) => Compare<T>
  /** Compare values by using other downstream comparators in turn, returning the first non-equal comparison. */
  export const compose: Compose =
    (...comparators) =>
    (a, b) =>
      comparators.reduce<Ordinal>((ordinal, compare) => ordinal || compare(a, b), Ordinal.EQ)

  type Nullish = null | undefined
  type CoalesceNulls = <T>(compare?: Compare<T>) => Compare<Nullish | T>

  const isNullish = <T>(value: Nullish | T): value is Nullish => value === null || value === undefined

  /** Compare values with nulls appearing first, otherwise using a downstream comparator */
  export const nullsFirst: CoalesceNulls =
    (compare = natural) =>
    (a, b) => {
      return isNullish(a) ? (isNullish(b) ? Ordinal.EQ : Ordinal.LT) : isNullish(b) ? Ordinal.GT : compare(a, b)
    }

  /** Compare values with nulls appearing last, otherwise using a downstream comparator */
  export const nullsLast: CoalesceNulls =
    (compare = natural) =>
    (a, b) => {
      return isNullish(a) ? (isNullish(b) ? Ordinal.EQ : Ordinal.GT) : isNullish(b) ? Ordinal.LT : compare(a, b)
    }
}
