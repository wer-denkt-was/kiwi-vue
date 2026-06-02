import { IPage, Pagination, Sort } from '@/api/page.model'
import { Api, RequestParams, unwrapResponseJson } from '@/services/api.service'
import { EntityNotFound } from '@/api'

interface FindOptions {
  fieldset?: string
  fields?: string
  accelerate?: boolean
}

interface FindPageOptions extends FindOptions, Partial<Pagination> {
  filter?: RequestParams
}

/**
 * API service interface supporting basic entity CRUD methods.
 * A generic implementation for a given entity type can be generated using {@link basicCrudService}.
 * @param T Entity type
 * @param ID Entity ID type
 */
export interface CrudService<T, ID> {
  readonly api: Api

  findById<S extends T = T>(id: ID, options?: FindOptions): Promise<null | S>

  requireById<S extends T = T>(id: ID, options?: FindOptions): Promise<S>

  findPage<S extends T = T>(options?: FindPageOptions): Promise<IPage<S>>

  create<POST extends object = object, R = T>(jsonBody: POST): Promise<R>

  update<PUT extends object = object, R = T>(id: ID, jsonBody: PUT): Promise<R>

  delete<R = T>(id: ID): Promise<R>
}

export interface CrudServiceClass<T, ID> {
  readonly entityType: string

  new (api: Api): CrudService<T, ID>
}

/** Application header for specifying Content-Type: application/json */
export const contentTypeJson = { 'Content-Type': 'application/json' } as const

/**
 * Generate a basic class implementing {@link CrudService} for a given entity type.
 * This class will use the following API endpoints:
 * - `findById(id)` --> `GET /<entityType>/{id}`
 * - `findPage(filter)` --> `GET /<entityType>?{filter}`
 * - `create(...)` --> `POST /<entityType>`
 * - `update(id, ...)` --> `PUT /<entityType>`
 * - `delete(id)` --> `DELETE /<entityType>/{id}`
 */
export function basicCrudService<T, ID>(entityType: string): CrudServiceClass<T, ID> {
  function findRequestParams(options: Partial<FindPageOptions>): RequestParams {
    const filterParams = options.filter || {}
    const optionParams = {
      _size: options.pageSize,
      _page: options.pageNumber,
      _sort: options.sort?.map(sortParam),
      _fields: options.fields,
      _fieldset: options.fieldset,
      _accelerate: options.accelerate,
    }
    return Object.assign({}, optionParams, filterParams)
  }

  function sortParam(sort: Sort): string {
    return `${sort.field},${sort.direction}`
  }

  return class BasicCrudService implements CrudService<T, ID> {
    static readonly entityType = entityType

    constructor(readonly api: Api) {}

    async findById<S extends T = T>(id: ID, options: FindOptions = {}): Promise<null | S> {
      const endpoint = `${entityType}/${id}`
      const queryParams = findRequestParams(options)
      const response = await this.api.request(endpoint, queryParams, { method: 'GET' })
      return response.status === 404 ? null : unwrapResponseJson<S>(response, options.accelerate)
    }

    async requireById<S extends T = T>(id: ID, options: FindOptions = {}): Promise<S> {
      const result = await this.findById<S>(id, options)
      if (result === null) {
        throw new EntityNotFound(entityType, String(id))
      } else {
        return result
      }
    }

    async findPage<S extends T = T>(options: FindPageOptions = {}): Promise<IPage<S>> {
      const endpoint = entityType
      const queryParams = findRequestParams(options)
      const response = await this.api.request(endpoint, queryParams, { method: 'GET' })
      return unwrapResponseJson<IPage<S>>(response, options.accelerate)
    }

    async create<POST extends object = object, R = T>(jsonBody: POST): Promise<R> {
      const endpoint = `${entityType}`
      const body = JSON.stringify(jsonBody)
      const response = await this.api.request(
        endpoint,
        {},
        {
          method: 'POST',
          headers: contentTypeJson,
          body,
        },
      )
      return unwrapResponseJson<R>(response)
    }

    async update<PUT extends object = object, R = T>(id: ID, jsonBody: PUT): Promise<R> {
      const endpoint = `${entityType}/${id}`
      const body = JSON.stringify(jsonBody)
      const response = await this.api.request(
        endpoint,
        {},
        {
          method: 'PUT',
          headers: contentTypeJson,
          body,
        },
      )
      return unwrapResponseJson<R>(response)
    }

    async delete<R = T>(id: ID): Promise<R> {
      const endpoint = `${entityType}/${id}`
      const response = await this.api.request(endpoint, {}, { method: 'DELETE' })
      return unwrapResponseJson<R>(response)
    }
  }
}
