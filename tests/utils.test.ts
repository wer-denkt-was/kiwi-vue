import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  Compare,
  decelerate,
  deferPromise,
  delay,
  errorMessage,
  loadAllPages,
  Ordinal,
  sorting,
  TODO,
  unreachable,
} from '@/utils'
import type { IPage, Pagination } from '@/api'

describe('loadAllPages', () => {
  it('loads all pages if the server caps the page size', async () => {
    // Server caps the page size at 2, although 10 are requested
    const items = [1, 2, 3, 4, 5]
    const requested: Array<Pagination> = []
    const loadPage = async (pagination: Pagination): Promise<IPage<number>> => {
      requested.push(pagination)
      const pageSize = Math.min(pagination.pageSize, 2)
      const start = pagination.pageNumber * pageSize
      return {
        items: items.slice(start, start + pageSize),
        pageSize,
        pageNumber: pagination.pageNumber,
        totalPages: Math.ceil(items.length / pageSize),
        totalItems: items.length,
      }
    }

    expect(await loadAllPages({ loadPage, pageSize: 10 })).toEqual(items)
    expect(requested.map(p => p.pageNumber)).toEqual([0, 1, 2])
    expect(requested[0]?.sort).toEqual([{ field: 'id', direction: 'asc' }])
  })

  it('loads a single page only once, with the given sort', async () => {
    const requested: Array<Pagination> = []
    const sort = [
      { field: 'title', direction: 'asc' },
      { field: 'id', direction: 'desc' },
    ] as const
    const items = await loadAllPages({
      loadPage: async pagination => {
        requested.push(pagination)
        return { items: ['a'], pageSize: 100, pageNumber: 0, totalPages: 1, totalItems: 1 }
      },
      sort,
    })
    expect(items).toEqual(['a'])
    expect(requested).toEqual([{ pageNumber: 0, pageSize: 100, sort }])
  })
})

describe('Compare', () => {
  it('returns ordinals', () => {
    expect(Compare.number(10, 3)).toBe(Ordinal.GT)
    expect(Compare.caseInsensitive('a', 'B')).toBe(Ordinal.LT)
  })

  it('composes comparators', () => {
    const byName = Compare.byKey<{ name: string; id: number }, 'name'>('name', Compare.caseInsensitive)
    const sort = sorting(Compare.compose(byName, Compare.reverse(Compare.byKey('id'))))
    const sorted = sort([
      { name: 'b', id: 1 },
      { name: 'A', id: 1 },
      { name: 'a', id: 2 },
    ])
    expect(sorted).toEqual([
      { name: 'a', id: 2 },
      { name: 'A', id: 1 },
      { name: 'b', id: 1 },
    ])
  })

  it('sorts nullish values first or last', () => {
    expect(sorting(Compare.nullsFirst<number>())([2, null, 1, undefined])).toEqual([null, undefined, 1, 2])
    expect(sorting(Compare.nullsLast<number>(Compare.number))([2, null, 1])).toEqual([1, 2, null])
  })

  it('sorts by computed values without modifying the array', () => {
    const array = ['ccc', 'a', 'bb'] as const
    expect(sorting(Compare.compareBy((x: string) => x.length))(array)).toEqual(['a', 'bb', 'ccc'])
    expect(array).toEqual(['ccc', 'a', 'bb'])
  })
})

describe('decelerate', () => {
  it('replaces references recursively', () => {
    const accelerated = {
      accelerated: true,
      content: [
        { id: 1, list: { '@': 1 } },
        { id: 2, list: { '@': 1 }, tags: [{ '@': 0 }, null] },
      ],
      references: [{ name: 'tag' }, { id: 'L', owner: { '@': 0 } }],
    }
    expect(decelerate(accelerated)).toEqual([
      { id: 1, list: { id: 'L', owner: { name: 'tag' } } },
      { id: 2, list: { id: 'L', owner: { name: 'tag' } }, tags: [{ name: 'tag' }, null] },
    ])
  })

  it('returns content that is not accelerated as it is', () => {
    const content = { '@': 0 }
    expect(decelerate({ accelerated: false, content, references: [] })).toBe(content)
  })

  it('keeps objects that only look like references', () => {
    const content = [{ '@': 'x' }, { '@': 0, other: 1 }]
    expect(decelerate({ accelerated: true, content, references: ['ref'] })).toEqual(content)
  })
})

describe('promises', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('resolves and rejects deferred promises', async () => {
    const resolved = deferPromise<number>()
    resolved.resolve(1)
    await expect(resolved).resolves.toBe(1)

    const rejected = deferPromise<number>()
    rejected.reject(new Error('Boom'))
    await expect(rejected).rejects.toThrow('Boom')
  })

  it('delays operations', async () => {
    vi.useFakeTimers()
    let result: undefined | string
    void delay(500, Promise.resolve('done')).then(value => (result = value))

    await vi.advanceTimersByTimeAsync(499)
    expect(result).toBeUndefined()
    await vi.advanceTimersByTimeAsync(1)
    expect(result).toBe('done')
  })
})

describe('typing and errors', () => {
  it('throws for placeholders and unreachable code', () => {
    expect(() => TODO()).toThrow('TODO: not implemented yet')
    expect(() => TODO('later')).toThrow('TODO: later')
    expect(() => unreachable('x' as never)).toThrow('Unreachable code detected: "x"')
  })

  it.each([
    [new Error('Boom'), 'Boom'],
    ['text', 'text'],
    [42, '42'],
    [false, 'false'],
    [null, 'null'],
    [undefined, 'undefined'],
    [{ a: 1 }, '{"a":1}'],
  ])('extracts the message of %j', (error, expected) => {
    expect(errorMessage(error)).toBe(expected)
  })

  it('extracts messages of circular objects', () => {
    const circular: Record<string, unknown> = {}
    circular.self = circular
    expect(errorMessage(circular)).toBe('[object Object]')
  })
})
