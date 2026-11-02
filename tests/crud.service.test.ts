import { describe, expect, it } from 'vitest'
import { basicCrudService, basicReportService } from '@/services'
import { ApiError, EntityNotFound, ForbiddenError, UnauthorizedError } from '@/api'
import { empty, json, mockApi } from './helpers'

interface TodoItem {
  readonly id: string
  readonly title: string
}

interface CreateTodoItem {
  list: string
  title: string
}

interface UpdateTodoItem {
  title?: string
}

class TodoItemService extends basicCrudService<TodoItem, string, CreateTodoItem, UpdateTodoItem>('TodoItem') {}

const page = { items: [{ id: '1', title: 'Milk' }], pageSize: 50, pageNumber: 0, totalPages: 1, totalItems: 1 }

describe('basicCrudService', () => {
  it('resolves paths relative to the base URL', async () => {
    const { api, requests } = mockApi([json(page)], { apiUrl: 'https://example.com/api' })
    await new TodoItemService(api).findPage()
    expect(requests[0]?.url).toBe('https://example.com/api/TodoItem')
  })

  it('sends pagination, sort, fieldset and filter parameters', async () => {
    const { api, requests } = mockApi([json(page)])
    await new TodoItemService(api).findPage({
      pageNumber: 2,
      pageSize: 10,
      sort: [
        { field: 'title', direction: 'asc' },
        { field: 'id', direction: 'desc' },
      ],
      fieldset: 'short',
      filter: { 'title:contains': 'Milk' },
    })
    const url = new URL(requests[0]!.url)
    expect(url.searchParams.get('_page')).toBe('2')
    expect(url.searchParams.get('_size')).toBe('10')
    expect(url.searchParams.getAll('_sort')).toEqual(['title,asc', 'id,desc'])
    expect(url.searchParams.get('_fieldset')).toBe('short')
    expect(url.searchParams.get('title:contains')).toBe('Milk')
    expect(url.searchParams.has('_fields')).toBe(false)
  })

  it('decelerates accelerated pages', async () => {
    const accelerated = {
      accelerated: true,
      content: { ...page, items: [{ id: '1', list: { '@': 0 } }] },
      references: [{ id: 'L1', title: 'List' }],
    }
    const { api, requests } = mockApi([json(accelerated)])
    const result = await new TodoItemService(api).findPage({ accelerate: true })
    expect(new URL(requests[0]!.url).searchParams.get('_accelerate')).toBe('true')
    expect(result.items).toEqual([{ id: '1', list: { id: 'L1', title: 'List' } }])
  })

  it('finds entities by encoded ID, and resolves null for 404', async () => {
    const { api, requests } = mockApi([json({ id: 'a/b', title: 'Milk' }), empty(404)])
    const service = new TodoItemService(api)
    expect(await service.findById('a/b')).toEqual({ id: 'a/b', title: 'Milk' })
    expect(requests[0]?.url).toBe('https://example.com/api/TodoItem/a%2Fb')
    expect(await service.findById('2')).toBeNull()
  })

  it('rejects requireById with EntityNotFound for 404', async () => {
    const { api } = mockApi([empty(404)])
    await expect(new TodoItemService(api).requireById('2')).rejects.toBeInstanceOf(EntityNotFound)
  })

  it('creates with POST and updates with PATCH', async () => {
    const { api, requests } = mockApi([json({ id: '1', title: 'Milk' }, 201), json({ id: '1', title: 'Bread' })])
    const service = new TodoItemService(api)
    await service.create({ list: 'L1', title: 'Milk' })
    await service.update('1', { title: 'Bread' })

    expect(requests.map(r => [r.method, r.url, r.body])).toEqual([
      ['POST', 'https://example.com/api/TodoItem', { list: 'L1', title: 'Milk' }],
      ['PATCH', 'https://example.com/api/TodoItem/1', { title: 'Bread' }],
    ])
    expect(requests[1]?.headers.get('Content-Type')).toBe('application/json')
  })

  it('deletes with DELETE, accepting empty responses', async () => {
    const { api, requests } = mockApi([empty(204)])
    expect(await new TodoItemService(api).delete('1')).toBeUndefined()
    expect(requests[0]?.method).toBe('DELETE')
  })

  it('fetches the generic metadata', async () => {
    const metadata = { entityName: 'TodoItem', entityClassName: 'de.kiwi.demo.TodoItem' }
    const { api, requests } = mockApi([json(metadata)])
    expect(await new TodoItemService(api).fetchMetadata()).toEqual(metadata)
    expect(requests[0]?.url).toBe('https://example.com/api/TodoItem/_schema')
  })

  it('rejects with the error of a Kiwi error response, including nested field errors', async () => {
    const errorBody = {
      message: 'entity-body-invalid',
      arguments: {
        entityType: 'de.kiwi.demo.TodoItem',
        errors: [
          { code: 'entity-field-missing-value', args: { entityType: 'de.kiwi.demo.TodoItem', fieldName: 'title' } },
          { code: 'entity-field-unknown', args: { entityType: 'de.kiwi.demo.TodoItem', fieldName: 'id' } },
        ],
      },
      errorType: 'de.kiwi.api.domain.EntityBodyInvalid',
    }
    const { api } = mockApi([json(errorBody, 400)])
    const error = await new TodoItemService(api).create({ list: 'L1', title: '' }).catch((e: unknown) => e)

    expect(error).toBeInstanceOf(ApiError)
    const apiError = error as ApiError
    expect(apiError.code).toBe('entity-body-invalid')
    expect(apiError.status).toBe(400)
    expect(apiError.errorType).toBe('de.kiwi.api.domain.EntityBodyInvalid')
    expect(apiError.errors.map(e => [e.code, e.details.fieldName])).toEqual([
      ['entity-field-missing-value', 'title'],
      ['entity-field-unknown', 'id'],
    ])
  })

  it('rejects with errors by status for responses without error body', async () => {
    const { api } = mockApi([empty(401), empty(403), () => new Response('<html>Bad Gateway</html>', { status: 502 })])
    const service = new TodoItemService(api)

    const unauthorized = await service.findPage().catch((e: unknown) => e)
    expect(unauthorized).toBeInstanceOf(UnauthorizedError)
    expect((unauthorized as ApiError).code).toBe('unauthorized')

    const forbidden = await service.findPage().catch((e: unknown) => e)
    expect(forbidden).toBeInstanceOf(ForbiddenError)
    expect((forbidden as ApiError).code).toBe('forbidden')

    const badGateway = await service.findPage().catch((e: unknown) => e)
    expect(badGateway).toBeInstanceOf(ApiError)
    expect((badGateway as ApiError).status).toBe(502)
  })

  it('keeps the error code of a 403 response body', async () => {
    const { api } = mockApi([json({ message: 'access-denied', arguments: {}, errorType: 'x' }, 403)])
    const error = await new TodoItemService(api).findPage().catch((e: unknown) => e)
    expect(error).toBeInstanceOf(ForbiddenError)
    expect((error as ApiError).code).toBe('access-denied')
  })
})

describe('basicReportService', () => {
  it('queries reports relative to the base URL', async () => {
    const { api, requests } = mockApi([json({ headers: ['listId', 'total'], body: [['L1', 2]] })])
    class TodoItemReportService extends basicReportService('TodoItem') {}
    const report = await new TodoItemReportService(api).queryReport({
      dimensions: ['listId'],
      metrics: ['total', 'completed'],
      slices: { listId: { in: ['L1', 'L2'] } },
      sort: [{ field: 'total', direction: 'desc' }],
    })

    const url = new URL(requests[0]!.url)
    expect(url.pathname).toBe('/api/TodoItem/_report')
    expect(url.searchParams.get('_dimensions')).toBe('listId')
    expect(url.searchParams.get('_metrics')).toBe('total,completed')
    expect(url.searchParams.get('_sort')).toBe('total,desc')
    expect(JSON.parse(url.searchParams.get('listId')!)).toEqual({ in: ['L1', 'L2'] })
    expect(report.columnSum('total')).toBe(2)
  })

  it('fetches the report schema', async () => {
    const schema = { dimensions: [{ name: 'listId', valueType: 'TodoListId' }], metrics: [] }
    const { api, requests } = mockApi([json(schema)])
    class TodoItemReportService extends basicReportService('TodoItem') {}
    expect(TodoItemReportService.entityType).toBe('TodoItem')
    expect(await new TodoItemReportService(api).fetchReportSchema()).toEqual(schema)
    expect(requests[0]?.url).toBe('https://example.com/api/TodoItem/_report/_schema')
  })
})
