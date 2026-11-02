import { describe, expect, it } from 'vitest'
import { columnFilter, sortParams } from '@/api'
import { basicCrudService } from '@/services'
import { json, mockApi } from './helpers'

describe('sortParams', () => {
  it('formats sort orders', () => {
    expect(
      sortParams([
        { field: 'title', direction: 'asc' },
        { field: 'list.title', direction: 'desc' },
      ]),
    ).toEqual(['title,asc', 'list.title,desc'])
  })
})

describe('columnFilter', () => {
  it('creates column filter parameters with or without operator', () => {
    expect(columnFilter('status', undefined, 'Open')).toEqual({ status: 'Open' })
    expect(columnFilter('status', 'in', ['Open', 'Done'])).toEqual({ 'status:in': 'Open,Done' })
    expect(columnFilter('order', 'ge', 1)).toEqual({ 'order:ge': '1' })
    expect(columnFilter('content', 'null', false)).toEqual({ 'content:null': 'false' })
  })

  it('escapes commas and backslashes in values', () => {
    expect(columnFilter('title', 'contains', 'Milk, 2l')).toEqual({ 'title:contains': 'Milk\\, 2l' })
    expect(columnFilter('title', 'in', ['a\\b', 'c,'])).toEqual({ 'title:in': 'a\\\\b,c\\,' })
  })

  it('creates no parameter without values', () => {
    expect(columnFilter('status', 'in', [])).toEqual({})
  })

  it('is sent as query parameter of paginated queries', async () => {
    const page = { items: [], pageSize: 50, pageNumber: 0, totalPages: 0, totalItems: 0 }
    const { api, requests } = mockApi([json(page)])
    await new (basicCrudService('TodoItem'))(api).findPage({
      filter: { ...columnFilter('status', undefined, ['Open', 'Done']), ...columnFilter('order', 'lt', 10) },
    })
    expect(requests[0]?.url).toBe('https://example.com/api/TodoItem?status=Open%2CDone&order%3Alt=10')
  })
})
