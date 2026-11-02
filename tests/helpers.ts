import { vi } from 'vitest'
import type { MaybeRefOrGetter } from 'vue'
import { type Api, createApi } from '@/services'
import { type ApiCredentials, missingCredentials } from '@/api'

export interface RecordedRequest {
  readonly url: string
  readonly method: string
  readonly headers: Headers
  readonly body: unknown
}

export interface MockApiOptions {
  readonly apiUrl?: string
  readonly credentials?: MaybeRefOrGetter<ApiCredentials>
}

export interface MockApiResult {
  readonly api: Api
  readonly requests: Array<RecordedRequest>
}

/** Create an {@link Api} with a mocked fetch, responding with the given responses in order */
export function mockApi(responses: ReadonlyArray<() => Response>, options: MockApiOptions = {}): MockApiResult {
  const requests: Array<RecordedRequest> = []

  let index = 0
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const body = typeof init?.body === 'string' ? JSON.parse(init.body) : init?.body
    requests.push({ url: String(input), method: init?.method ?? 'GET', headers: new Headers(init?.headers), body })
    const response = responses[index++]
    if (!response) throw new Error(`Unexpected request: ${String(input)}`)
    return response()
  })

  const api = createApi({
    apiUrl: options.apiUrl ?? 'https://example.com/api',
    credentials: options.credentials ?? missingCredentials,
    fetch: fetchMock as typeof fetch,
  })

  return { api, requests }
}

export const json = (body: unknown, status: number = 200) => {
  const headers = { 'Content-Type': 'application/json' }
  const responseInit: ResponseInit = { status, headers }
  return () => {
    const content = JSON.stringify(body)
    return new Response(content, responseInit)
  }
}

export const empty = (status: number) => {
  const responseInit: ResponseInit = { status }
  return () => new Response(null, responseInit)
}
