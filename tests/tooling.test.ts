import { KiwiResolver } from '@/tooling'
import { describe, expect, it } from 'vitest'

describe('KiwiResolver', () => {
  it('resolves Kiwi components from the components entry point', () => {
    const resolver = KiwiResolver()
    const resolve = typeof resolver === 'function' ? resolver : resolver.resolve
    expect(resolve('Loading')).toEqual({ name: 'Loading', from: '@werdenktwas/kiwi-vue/components' })
    expect(resolve('ErrorBoundary')).toEqual({ name: 'ErrorBoundary', from: '@werdenktwas/kiwi-vue/components' })
    expect(resolve('RouterView')).toBeUndefined()
  })
})
