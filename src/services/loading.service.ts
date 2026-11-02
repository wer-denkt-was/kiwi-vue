import { ComputedRef, MaybeRefOrGetter, ShallowRef } from 'vue'

const loadingState = 'loading'
type LoadingIdle = { readonly [loadingState]: 'idle' }
type LoadingPending<T> = { readonly [loadingState]: 'pending'; readonly previousResult?: T }
type LoadingSuccess<T> = { readonly [loadingState]: 'loaded'; readonly result: T }
type LoadingError = { readonly [loadingState]: 'failed'; readonly error: unknown }

/**
 * Variant type representing the state of a loading operation.
 * - Upon initialization, the loading operation is **idle**.
 * - When loading starts, the loading operation is **pending**.
 * - When loading completes, the loading operation is **loaded** and contains the operation result.
 * - If loading encounters an error, the loading operation is **failed** and contains the encountered error.
 */
export type LoadingState<T> = LoadingIdle | LoadingPending<T> | LoadingSuccess<T> | LoadingError

// eslint-disable-next-line @typescript-eslint/no-namespace
export namespace LoadingState {
  export const idle: LoadingIdle = { loading: 'idle' } as const

  export function pending<T>(): LoadingPending<T>
  export function pending<T>(previousResult: T): LoadingPending<T>
  export function pending<T>(previousResult?: T): LoadingPending<T> {
    return arguments.length > 0 ? ({ loading: 'pending', previousResult } as const) : ({ loading: 'pending' } as const)
  }

  export function loaded<T>(result: T): LoadingSuccess<T> {
    return { loading: 'loaded', result } as const
  }

  export function failed(error: unknown): LoadingError {
    return { loading: 'failed', error } as const
  }
}

/**
 * Options used for controlling `LoadingService.load` behavior
 * @see LoadingService.load
 * @see LoadingOptions.pending
 * @see LoadingOptions.abort
 */
export interface LoadingOptions {
  /**
   * If `true` (default), switch to pending-state immediately.
   * Otherwise, remain in the current state until the loading-operation completes.
   */
  readonly pending?: boolean

  /**
   * An {@link AbortController} that will receive a signal if another `LoadingService.load` operation is invoked
   * (or the service is reset) before this operation is completed. Can be used to cancel the ongoing loading
   * operation, as its results will be ignored by the `LoadingService` after a new operation has been started.
   * @example ```ts
   * const abort = new AbortController()
   * await todoItems.load(todoItemService.findPage({ signal: abort.signal }), { abort })
   * ```
   */
  readonly abort?: AbortController
}

/**
 * Service for managing a {@link LoadingState}.
 * An instance of this service can start a loading operation, compute the operation result,
 * and presents a reactive view of the current loading operation state.
 */
export interface LoadingService<T> {
  /** View of the current loading state of the service */
  readonly state: ShallowRef<LoadingState<T>>

  /** Computes true if the state is currently pending */
  readonly isLoading: ComputedRef<boolean>

  /** Computes the result if state has loaded, or null otherwise */
  readonly resultOrNull: ComputedRef<null | T>

  /** Trigger a loading operation, switching immediately to pending-state until the loading operation is completed */
  load<R extends T>(operation: Promise<R>): Promise<R>

  /**
   * Trigger a loading operation, switching to pending-state immediately if `pending` is true,
   * or remain in the current state until the loading operation is completed if `pending` is false
   */
  load<R extends T>(operation: Promise<R>, pending: boolean): Promise<R>

  /** Trigger a loading operation with the given {@link LoadingOptions} */
  load<R extends T>(operation: Promise<R>, options: LoadingOptions): Promise<R>

  /** Replace the previously loaded result without triggering another load */
  replace(mapper: (result: T) => T): void

  /** Immediately emplace a result value, instantly setting the loading operation to be completed */
  emplace(value: T): void

  /** Computed ref of a mapping of the current loading state, mapping the previous result of a pending state as well */
  computeState<R>(mapper: (result: T) => R): ComputedRef<LoadingState<R>>

  /** Computed ref mapping the currently loaded result, or a pending placeholder value */
  computeResult<R>(mapper: (result: T) => R, pending: MaybeRefOrGetter<R>): ComputedRef<R>

  combineStates<R, S>(
    other: MaybeRefOrGetter<LoadingState<R>>,
    combiner: (first: T, second: R) => S,
  ): ComputedRef<LoadingState<S>>

  /** Computed ref of the currently loaded result, or a pending placeholder value  */
  resultOrElse(pending: MaybeRefOrGetter<T>): ComputedRef<T>

  /** Reset the state of the service back to "idle", aborting and ignoring an ongoing loading operation */
  reset(): void
}

/**
 * Create a reactive {@link LoadingService}.
 */
export function useLoading<T>(): LoadingService<T> {
  return new LoadingServiceImpl<T>()
}

class LoadingServiceImpl<T> implements LoadingService<T> {
  /**
   * Reactive state of the LoadingService instance
   */
  public readonly state = shallowRef<LoadingState<T>>(LoadingState.idle)
  readonly isLoading: ComputedRef<boolean> = computed(() => this.state.value.loading === 'pending')
  readonly resultOrNull: ComputedRef<null | T> = computed(() => {
    const state = this.state.value
    return state.loading === 'loaded' ? state.result : null
  })
  /**
   * Only the latest value should be published in the state.
   * For this reason, a local variable tracks the "latest" promise,
   * and only the latest promise will affect the loading state.
   * In case a new operation is started while another is still pending,
   * the new operation will replace the previous operation.
   */
  private _latestOperation?: Promise<T>
  private _latestAbortController?: AbortController
  private _latestResult?: { readonly value: T }

  async load<R extends T>(operation: Promise<R>, pendingOrOptions?: boolean | LoadingOptions): Promise<R> {
    const { pending = true, abort } = decodeLoadingOptions(pendingOrOptions)

    // Cancel ongoing operation, if any is still currently active
    this.abortLatestOperation()

    // Begin loading operation, and if requested, switch to pending-state
    this._latestOperation = operation
    this._latestAbortController = abort
    if (pending) this.changeToPending()

    try {
      // Asynchronously wait for loading operation to finish
      const result = await operation

      // Loading finished successfully
      if (this.isLatestOperation(operation)) {
        this._latestResult = { value: result }
        this.state.value = LoadingState.loaded(result)
      }
      return result
    } catch (error: unknown) {
      // Loading finished with an error
      if (this.isLatestOperation(operation)) {
        delete this._latestResult
        this.state.value = LoadingState.failed(error)
      }
      throw error
    } finally {
      // Cleanup, unless another operation has been started in the meantime
      if (this.isLatestOperation(operation)) {
        delete this._latestOperation
        delete this._latestAbortController
      }
    }
  }

  replace(mapper: (result: T) => T): void {
    const state = this.state.value
    if (state.loading === 'loaded') {
      const result = mapper(state.result)
      this._latestResult = { value: result }
      this.state.value = LoadingState.loaded(result)
    }
  }

  emplace(value: T): void {
    // Cancel and ignore ongoing operation, if any is still currently active
    this.abortLatestOperation()
    delete this._latestOperation
    this._latestResult = { value }
    this.state.value = LoadingState.loaded(value)
  }

  reset(): void {
    // Cancel and ignore ongoing operation, if any is still currently active
    this.abortLatestOperation()
    delete this._latestOperation
    delete this._latestResult
    this.state.value = LoadingState.idle
  }

  computeState<R>(mapper: (result: T) => R): ComputedRef<LoadingState<R>> {
    return computed((): LoadingState<R> => {
      const state = this.state.value
      if (state.loading === 'loaded') {
        return LoadingState.loaded(mapper(state.result))
      } else if (state.loading === 'pending') {
        return 'previousResult' in state
          ? LoadingState.pending(mapper(state.previousResult as T))
          : LoadingState.pending()
      } else {
        return state
      }
    })
  }

  computeResult<R>(mapper: (result: T) => R, pending: MaybeRefOrGetter<R>): ComputedRef<R> {
    return computed((): R => {
      const state = this.state.value
      return state.loading === 'loaded' ? mapper(state.result) : toValue(pending)
    })
  }

  combineStates<R, S>(
    other: MaybeRefOrGetter<LoadingState<R>>,
    combiner: (first: T, second: R) => S,
  ): ComputedRef<LoadingState<S>> {
    return computed((): LoadingState<S> => {
      const firstState = this.state.value
      const secondState = toValue(other)

      if (firstState.loading !== 'loaded') {
        return firstState.loading === 'pending' ? LoadingState.pending() : firstState
      } else if (secondState.loading !== 'loaded') {
        return secondState.loading === 'pending' ? LoadingState.pending() : secondState
      } else {
        const combinedResult = combiner(firstState.result, secondState.result)
        return LoadingState.loaded(combinedResult)
      }
    })
  }

  resultOrElse(pending: MaybeRefOrGetter<T>): ComputedRef<T> {
    return computed((): T => {
      const state = this.state.value
      return state.loading === 'loaded' ? state.result : toValue(pending)
    })
  }

  private changeToPending() {
    this.state.value = this._latestResult ? LoadingState.pending(this._latestResult.value) : LoadingState.pending()
  }

  private abortLatestOperation() {
    const abortController = this._latestAbortController
    delete this._latestAbortController
    abortController?.abort()
  }

  private isLatestOperation(operation: Promise<T>): boolean {
    // Only mutate instance-state if given operation is still the latest currently active operation.
    // Otherwise, another operation has asynchronously been started in the meantime (or the service has been reset),
    // and outdated state changes are ignored.
    return operation === this._latestOperation
  }
}

function decodeLoadingOptions(variant: undefined | boolean | LoadingOptions): LoadingOptions {
  if (variant === undefined) {
    return { pending: true }
  } else if (typeof variant === 'boolean') {
    return { pending: variant }
  } else {
    return variant
  }
}
