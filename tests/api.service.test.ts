// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import { defineComponent, h, ref } from 'vue'
import { mount } from '@vue/test-utils'
import {
  type Api,
  basicCrudService,
  provideApi,
  readResponseError,
  unwrapResponseJson,
  useApi,
  useApiService,
} from '@/services'
import { type ApiCredentials, ApiError, bearerToken, missingCredentials } from '@/api'
import { empty, json, mockApi } from './helpers'

describe('Api', () => {
  it.each([
    ['https://example.com/api', 'TodoItem', 'https://example.com/api/TodoItem'],
    ['https://example.com/api/', '/TodoItem', 'https://example.com/api/TodoItem'],
    ['https://example.com', 'TodoItem/_schema', 'https://example.com/TodoItem/_schema'],
    ['https://example.com/a/b', '//TodoItem/1', 'https://example.com/a/b/TodoItem/1'],
  ])('resolves paths relative to "%s"', async (apiUrl, path, expected) => {
    const { api, requests } = mockApi([empty(200)], { apiUrl })
    await api.request(path)
    expect(requests[0]?.url).toBe(expected)
    expect(api.baseUrl.pathname.endsWith('/')).toBe(true)
  })

  it('requests absolute URLs as they are', async () => {
    const { api, requests } = mockApi([empty(200)])
    await api.request(new URL('https://files.example.com/x?y=1'), { method: 'HEAD' })
    expect(requests[0]).toMatchObject({ url: 'https://files.example.com/x?y=1', method: 'HEAD' })
  })

  it('encodes query parameters, repeating arrays and skipping absent values', async () => {
    const { api, requests } = mockApi([empty(200)])
    await api.request('TodoItem', { a: 'x y', b: 1, c: false, d: null, e: undefined, f: ['1', null, 2, undefined] })
    const url = new URL(requests[0]!.url)
    expect([...url.searchParams]).toEqual([
      ['a', 'x y'],
      ['b', '1'],
      ['c', 'false'],
      ['f', '1'],
      ['f', '2'],
    ])
  })

  it('sends JSON requests, keeping the given request options', async () => {
    const { api, requests } = mockApi([empty(200), empty(200)])
    const abort = new AbortController()
    await api.jsonRequest('TodoItem', { title: 'Milk' }, 'POST', { _fieldset: 'short' }, { headers: { 'X-A': 'a' } })
    await api.jsonRequest('TodoItem/1', null, 'DELETE', {}, { signal: abort.signal })

    expect(requests[0]).toMatchObject({
      url: 'https://example.com/api/TodoItem?_fieldset=short',
      method: 'POST',
      body: { title: 'Milk' },
    })
    expect(requests[0]?.headers.get('X-A')).toBe('a')
    expect(requests[0]?.headers.get('Content-Type')).toBe('application/json')
    expect(requests[1]).toMatchObject({ method: 'DELETE', body: null })
  })

  it('authenticates and rewrites requests with the current credentials', async () => {
    const proxied: ApiCredentials = {
      authenticate: bearerToken('token'),
      rewrite: url => new URL(String(url).replace('example.com', 'proxy.example.com')),
      isValid: () => true,
    }
    const credentials = ref<ApiCredentials>(missingCredentials)
    const { api, requests } = mockApi([empty(204), empty(204)], { credentials })

    await api.request('TodoItem')
    credentials.value = proxied
    await api.request('TodoItem')

    expect(requests.map(({ url, headers }) => [url, headers.get('Authorization')])).toEqual([
      ['https://example.com/api/TodoItem', null],
      ['https://proxy.example.com/api/TodoItem', 'Bearer token'],
    ])
  })
})

describe('unwrapResponseJson', () => {
  it('resolves empty responses to undefined', async () => {
    expect(await unwrapResponseJson(empty(204)())).toBeUndefined()
    expect(await unwrapResponseJson(empty(200)(), true)).toBeUndefined()
  })

  it('rejects responses that are not JSON', async () => {
    const html = new Response('<!doctype html>', { status: 200, headers: { 'Content-Type': 'text/html' } })
    const error = await unwrapResponseJson(html).catch((e: unknown) => e)
    expect(error).toBeInstanceOf(ApiError)
    expect(error).toMatchObject({ code: 'response-not-json', details: { status: 200, contentType: 'text/html' } })
    expect((error as ApiError).cause).toBeInstanceOf(SyntaxError)
  })

  it('rejects error responses with an ApiError', async () => {
    await expect(unwrapResponseJson(json({ message: 'boom' }, 500)())).rejects.toMatchObject({
      code: 'boom',
      status: 500,
    })
  })
})

describe('readResponseError', () => {
  it('uses plain text bodies as error code', async () => {
    expect(await readResponseError(new Response(' too-many-requests ', { status: 429 }))).toMatchObject({
      code: 'too-many-requests',
      status: 429,
    })
  })
})

describe('provideApi', () => {
  class TodoItemService extends basicCrudService('TodoItem') {}

  function mountWithApi(provided: () => void, inject: () => unknown) {
    let injected: unknown
    const Child = defineComponent({
      setup() {
        injected = inject()
        return () => h('div')
      },
    })
    const Parent = defineComponent({
      setup() {
        provided()
        return () => h(Child)
      },
    })
    mount(Parent)
    return injected
  }

  it('provides an Api created from options', () => {
    let provided: undefined | Api
    const service = mountWithApi(
      () => (provided = provideApi({ apiUrl: 'https://example.com', credentials: missingCredentials })),
      () => useApiService(TodoItemService),
    ) as InstanceType<typeof TodoItemService>
    expect(service.api).toBe(provided)
  })

  it('provides an Api instance', () => {
    const { api } = mockApi([])
    expect(
      mountWithApi(
        () => provideApi(api),
        () => useApi(),
      ),
    ).toBe(api)
  })

  it('fails to inject without provider', () => {
    expect(() =>
      mountWithApi(
        () => {},
        () => useApi(),
      ),
    ).toThrow('Missing api provider')
  })
})
