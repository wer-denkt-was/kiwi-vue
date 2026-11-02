// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h } from 'vue'
import { mount } from '@vue/test-utils'
import {
  type ApiErrorConsumer,
  type ApiErrorDetails,
  type ApiErrorHandler,
  provideApiErrorHandler,
  simpleApiErrorTransformer,
  useApiErrorHandler,
} from '@/services'

afterEach(() => {
  vi.restoreAllMocks()
})

/** Mount nested components, each providing an error handler with the given options, and inject the innermost one */
function injectErrorHandler(...providers: ReadonlyArray<{ consumer: ApiErrorConsumer; inherit?: boolean }>) {
  let handler!: ApiErrorHandler
  const Innermost = defineComponent({
    setup() {
      handler = useApiErrorHandler()
      return () => h('div')
    },
  })
  const component = providers.reduceRight(
    (child, { consumer, inherit }) =>
      defineComponent({
        setup() {
          provideApiErrorHandler({ transform: simpleApiErrorTransformer, consumers: [consumer], inherit })
          return () => h(child)
        },
      }),
    Innermost,
  )
  mount(component)
  return handler
}

describe('ApiErrorHandler', () => {
  it('transforms errors and passes them to consumers', () => {
    const consumed: Array<ApiErrorDetails> = []
    const handler = injectErrorHandler({ consumer: details => consumed.push(details) })
    const error = new Error('Boom')

    handler.handle(error)
    expect(consumed).toEqual([{ error, rawMessage: 'Boom', formattedMessage: 'Boom' }])
    expect(handler.format('Oops')).toBe('Oops')
  })

  it('handles and rethrows rejected operations', async () => {
    const consumer = vi.fn()
    const handler = injectErrorHandler({ consumer })
    const error = new Error('Boom')

    await expect(handler.catch(Promise.reject(error))).rejects.toBe(error)
    await expect(handler.catch(Promise.resolve(1))).resolves.toBe(1)
    expect(consumer).toHaveBeenCalledTimes(1)
  })

  it('forwards errors to the parent handler if inheriting', () => {
    const [outer, middle, inner] = [vi.fn(), vi.fn(), vi.fn()]
    const handler = injectErrorHandler({ consumer: outer }, { consumer: middle }, { consumer: inner, inherit: true })
    handler.handle('Boom')
    expect([outer.mock.calls.length, middle.mock.calls.length, inner.mock.calls.length]).toEqual([0, 1, 1])
  })

  it('wraps services, handling rejected promises of their methods', async () => {
    const consumer = vi.fn()
    const handler = injectErrorHandler({ consumer })
    const service = {
      prefix: 'Hello',
      greet(name: string) {
        return `${this.prefix} ${name}`
      },
      async fail() {
        throw new Error('Boom')
      },
    }

    const wrapped = handler.wrapService(service)
    expect(wrapped.prefix).toBe('Hello')
    expect(wrapped.greet('World')).toBe('Hello World')
    expect(wrapped.greet).toBe(wrapped.greet) // wrapped functions are cached
    await expect(wrapped.fail()).rejects.toThrow('Boom')
    expect(consumer).toHaveBeenCalledTimes(1)
  })

  it('falls back to a console handler without provider', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    let handler!: ApiErrorHandler
    mount(
      defineComponent({
        setup() {
          handler = useApiErrorHandler()
          return () => h('div')
        },
      }),
    )

    handler.handle('Boom')
    expect(warn).toHaveBeenCalledOnce()
    expect(error).toHaveBeenCalledWith('Error:', expect.objectContaining({ formattedMessage: 'Boom' }))
  })
})
