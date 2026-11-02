// @vitest-environment happy-dom
import { describe, expect, it, vi } from 'vitest'
import { defineComponent, h, nextTick, onErrorCaptured, ref } from 'vue'
import { mount } from '@vue/test-utils'
import { ErrorBoundary, Loading } from '@/components'
import { LoadingState, useLoading } from '@/services'
import { deferPromise } from '@/utils'

const loadingSlots = {
  idle: () => 'idle',
  pending: ({ previousData }: { previousData?: string }) => `pending:${previousData ?? '-'}`,
  loaded: ({ data }: { data: string }) => `loaded:${data}`,
  failed: ({ error }: { error: unknown }) => `failed:${String(error)}`,
} as unknown as Record<string, () => string> // Mounting options type slots without slot props

describe('Loading', () => {
  it.each([
    [LoadingState.idle, 'idle'],
    [LoadingState.pending(), 'pending:-'],
    [LoadingState.pending('old'), 'pending:old'],
    [LoadingState.loaded('data'), 'loaded:data'],
    [LoadingState.failed('boom'), 'failed:boom'],
  ])('renders the slot of state %j', (state, expected) => {
    const wrapper = mount(Loading, { props: { state }, slots: loadingSlots })
    expect(wrapper.text()).toBe(expected)
  })

  it('follows the state of a LoadingService', async () => {
    const service = useLoading<string>()
    const wrapper = mount(Loading, { props: { state: service }, slots: loadingSlots })
    expect(wrapper.text()).toBe('idle')

    const operation = deferPromise<string>()
    const load = service.load(operation)
    await nextTick()
    expect(wrapper.text()).toBe('pending:-')

    operation.resolve('data')
    await load
    await nextTick()
    expect(wrapper.text()).toBe('loaded:data')
  })
})

describe('ErrorBoundary', () => {
  const failing = ref(true)
  const Failing = defineComponent({
    setup() {
      return () => {
        if (failing.value) throw new Error('Boom')
        return h('span', 'content')
      }
    },
  })

  function mountBoundary(props: Record<string, unknown> = {}, withErrorSlot: boolean = true) {
    return mount(ErrorBoundary, {
      props: { stopPropagation: true, ...props },
      slots: {
        default: () => h(Failing),
        ...(withErrorSlot && {
          error: ({ error, info, resetError }: { error: Error; info: string; resetError: () => void }) =>
            h('button', { onClick: resetError }, `${error.message} (${info})`),
        }),
      },
    })
  }

  it('renders the error slot for errors of the default slot, and resets on demand', async () => {
    failing.value = true
    const wrapper = mountBoundary()
    await nextTick()
    expect(wrapper.text()).toBe('Boom (render function)')
    expect(wrapper.emitted('error-caught')?.[0]?.[0]).toMatchObject({ message: 'Boom' })

    failing.value = false
    await wrapper.get('button').trigger('click')
    expect(wrapper.text()).toBe('content')
    expect(wrapper.emitted('error-reset')?.[0]?.[0]).toMatchObject({ message: 'Boom' })
  })

  it('logs caught errors to the console if requested', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    failing.value = true
    mountBoundary({ consoleLog: 'warn' })
    await nextTick()
    expect(warn).toHaveBeenCalledWith('ErrorBoundary caught error: "render function"', expect.any(Error))
    warn.mockRestore()
  })

  it.each([
    [false, 1],
    [true, 0],
  ])('propagates errors to parent components unless stopped (stopPropagation: %s)', async (stop, expected) => {
    const parentCaught = vi.fn(() => false)
    failing.value = true
    mount(
      defineComponent({
        setup() {
          onErrorCaptured(parentCaught)
          return () => h(ErrorBoundary, { stopPropagation: stop }, { default: () => h(Failing), error: () => 'error' })
        },
      }),
    )
    await nextTick()
    expect(parentCaught).toHaveBeenCalledTimes(expected)
  })
})
