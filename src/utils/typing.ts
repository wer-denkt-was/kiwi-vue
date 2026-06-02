/**
 * Mark this expression as an unfinished placeholder.
 */
export function TODO(comment: string = 'not implemented yet'): never {
  throw new Error(`TODO: ${comment}`)
}

/**
 * Verify that the given state is unreachable.
 * This should be used to provoke a compiler type error if unreachable code is created.
 */
export function unreachable(never: never): never {
  throw new Error(`Unreachable code detected: ${JSON.stringify(never)}`)
}
