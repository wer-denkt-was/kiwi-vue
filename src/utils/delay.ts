/**
 * Create an artificial delay, delaying the given operation by a number of milliseconds
 */
export function delay<T>(ms: number, op: Promise<T>): Promise<T> {
  return new Promise<T>(resolve => setTimeout(() => resolve(op), ms))
}
