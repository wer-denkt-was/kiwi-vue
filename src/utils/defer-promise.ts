/**
 * Promise that is deferred, and can be resolved/rejected using instance methods {@link resolve} and {@link reject}
 */
export interface DeferredPromise<T> extends Promise<T> {
  /** Resolve the deferred promise, as if calling `resolve` in a {@link Promise} constructor callback */
  resolve(value: T): void

  /** Reject the deferred promise, as if calling `reject` in a {@link Promise} constructor callback */
  reject(reason?: unknown): void
}

/**
 * Create a new {@link DeferredPromise} that is currently pending
 * @see DeferredPromise
 */
export function deferPromise<T>(): DeferredPromise<T> {
  let resolve!: DeferredPromise<T>['resolve']
  let reject!: DeferredPromise<T>['reject']
  const promise = new Promise<T>((_resolve, _reject) => {
    resolve = _resolve
    reject = _reject
  })

  return Object.assign(promise, { resolve, reject })
}
