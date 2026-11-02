import { describe, expect, it } from 'vitest'
import { useLoading } from '@/services'
import { deferPromise } from '@/utils'

describe('useLoading', () => {
  it('only publishes the result of the latest operation', async () => {
    const loading = useLoading<string>()
    const first = deferPromise<string>()
    const second = deferPromise<string>()

    const firstLoad = loading.load(first)
    const secondLoad = loading.load(second)
    second.resolve('second')
    await secondLoad
    first.resolve('first')
    await firstLoad

    expect(loading.state.value).toEqual({ loading: 'loaded', result: 'second' })
  })

  it('aborts the previous operation, without losing the abort controller of the latest operation', async () => {
    const loading = useLoading<string>()
    const [first, second, third] = [deferPromise<string>(), deferPromise<string>(), deferPromise<string>()]
    const [firstAbort, secondAbort] = [new AbortController(), new AbortController()]

    const firstLoad = loading.load(first, { abort: firstAbort })
    void loading.load(second, { abort: secondAbort })
    expect(firstAbort.signal.aborted).toBe(true)

    // Completing the outdated operation must not discard the abort controller of the second operation
    first.resolve('first')
    await firstLoad
    void loading.load(third)
    expect(secondAbort.signal.aborted).toBe(true)
  })

  it('provides the previous result while pending', async () => {
    const loading = useLoading<number>()
    await loading.load(Promise.resolve(1))

    const next = deferPromise<number>()
    void loading.load(next)
    expect(loading.state.value).toEqual({ loading: 'pending', previousResult: 1 })
    expect(loading.computeState(x => x * 10).value).toEqual({ loading: 'pending', previousResult: 10 })
  })

  it('has no previous result before the first result', () => {
    const loading = useLoading<number>()
    void loading.load(deferPromise<number>())
    expect(loading.state.value).toEqual({ loading: 'pending' })
  })

  it('ignores ongoing operations after a reset', async () => {
    const loading = useLoading<string>()
    const operation = deferPromise<string>()
    const abort = new AbortController()
    const load = loading.load(operation, { abort })

    loading.reset()
    expect(abort.signal.aborted).toBe(true)
    operation.resolve('late')
    await load
    expect(loading.state.value).toEqual({ loading: 'idle' })
  })

  it('publishes failures of the latest operation', async () => {
    const loading = useLoading<string>()
    const error = new Error('Boom')
    await expect(loading.load(Promise.reject(error))).rejects.toBe(error)
    expect(loading.state.value).toEqual({ loading: 'failed', error })
  })

  it('stays in the current state if not pending', async () => {
    const loading = useLoading<number>()
    await loading.load(Promise.resolve(1))

    const next = deferPromise<number>()
    const load = loading.load(next, false)
    expect(loading.state.value).toEqual({ loading: 'loaded', result: 1 })
    expect(loading.isLoading.value).toBe(false)

    next.resolve(2)
    await load
    expect(loading.resultOrNull.value).toBe(2)
  })

  it('replaces loaded results', async () => {
    const loading = useLoading<ReadonlyArray<number>>()
    loading.replace(items => [...items, 1]) // Ignored while not loaded
    expect(loading.state.value).toEqual({ loading: 'idle' })

    await loading.load(Promise.resolve([1]))
    loading.replace(items => [...items, 2])
    expect(loading.resultOrNull.value).toEqual([1, 2])

    // The replaced result is the previous result of the next operation
    void loading.load(deferPromise<ReadonlyArray<number>>(), { pending: true })
    expect(loading.state.value).toEqual({ loading: 'pending', previousResult: [1, 2] })
  })

  it('computes results with placeholders', async () => {
    const loading = useLoading<string>()
    const length = loading.computeResult(text => text.length, -1)
    const text = loading.resultOrElse(() => '...')
    expect([length.value, text.value, loading.isLoading.value]).toEqual([-1, '...', false])

    const operation = deferPromise<string>()
    const load = loading.load(operation)
    expect(loading.isLoading.value).toBe(true)
    operation.resolve('abc')
    await load
    expect([length.value, text.value, loading.isLoading.value]).toEqual([3, 'abc', false])
  })

  it('combines loading states', async () => {
    const first = useLoading<number>()
    const second = useLoading<string>()
    const combined = first.combineStates(second.state, (a, b) => `${a}${b}`)
    expect(combined.value).toEqual({ loading: 'idle' })

    await first.load(Promise.resolve(1))
    void second.load(deferPromise<string>())
    expect(combined.value).toEqual({ loading: 'pending' })

    const error = new Error('Boom')
    await second.load(Promise.reject(error)).catch(() => {})
    expect(combined.value).toEqual({ loading: 'failed', error })

    await second.load(Promise.resolve('a'))
    expect(combined.value).toEqual({ loading: 'loaded', result: '1a' })

    void first.load(deferPromise<number>())
    expect(combined.value).toEqual({ loading: 'pending' })
  })

  it('maps idle and failed states', async () => {
    const loading = useLoading<number>()
    const mapped = loading.computeState(x => x * 2)
    expect(mapped.value).toEqual({ loading: 'idle' })

    await loading.load(Promise.resolve(2))
    expect(mapped.value).toEqual({ loading: 'loaded', result: 4 })

    const error = new Error('Boom')
    await loading.load(Promise.reject(error)).catch(() => {})
    expect(mapped.value).toEqual({ loading: 'failed', error })
  })

  it('emplaces results, ignoring ongoing operations', async () => {
    const loading = useLoading<string>()
    const operation = deferPromise<string>()
    const abort = new AbortController()
    const load = loading.load(operation, { abort })

    loading.emplace('cached')
    expect(abort.signal.aborted).toBe(true)
    expect(loading.state.value).toEqual({ loading: 'loaded', result: 'cached' })

    operation.resolve('late')
    await load
    expect(loading.resultOrNull.value).toBe('cached')

    void loading.load(deferPromise<string>())
    expect(loading.state.value).toEqual({ loading: 'pending', previousResult: 'cached' })
  })
})
