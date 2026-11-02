import { IPage, Pagination, sortParams } from '@/api/page.model'
import { GenericMetadata } from '@/api/metadata.model'
import { Api, RequestParams, unwrapResponseJson } from '@/services/api.service'
import { EntityNotFound } from '@/api'

/** Options applicable to all requests of a {@link CrudService} */
export interface RequestOptions {
  /** Signal aborting the request, e.g. from the `AbortController` passed to `LoadingService.load` */
  signal?: AbortSignal
}

export interface FindOptions extends RequestOptions {
  /** Name of the fieldset to load (`_fieldset`), the server uses the `default` fieldset if absent */
  fieldset?: string
  /** Dynamic fieldset (`_fields`), taking precedence over `fieldset` */
  fields?: string
  /** Request an accelerated response (`_accelerate`), which is decelerated transparently */
  accelerate?: boolean
}

export interface FindPageOptions extends FindOptions, Partial<Pagination> {
  /**
   * Filter parameters of the entity query, and column filters like `title:contains=Milk`
   * @see columnFilter
   */
  filter?: RequestParams
}

/**
 * API service interface supporting basic entity CRUD methods.
 * A generic implementation for a given entity type can be generated using {@link basicCrudService}.
 * @param T Entity type, i.e. the fieldset type returned by queries and commands
 * @param ID Entity ID type
 * @param C JSON body type of create commands, e.g. a generated `ICreate<Entity>` interface
 * @param U JSON body type of update commands, e.g. a generated `IUpdate<Entity>` interface
 */
export interface CrudService<T, ID, C extends object = object, U extends object = object> {
  readonly api: Api

  /** Find an entity by its ID, resolving to `null` if it does not exist */
  findById<S extends T = T>(id: ID, options?: FindOptions): Promise<null | S>

  /** Find an entity by its ID, rejecting with {@link EntityNotFound} if it does not exist */
  requireById<S extends T = T>(id: ID, options?: FindOptions): Promise<S>

  findPage<S extends T = T>(options?: FindPageOptions): Promise<IPage<S>>

  create<R = T>(body: C, options?: RequestOptions): Promise<R>

  /** Partially update an entity: only the properties present in the body are changed */
  update<R = T>(id: ID, body: U, options?: RequestOptions): Promise<R>

  delete<R = T>(id: ID, options?: RequestOptions): Promise<R>

  /** Load the metadata of the entity's generic queries and commands */
  fetchMetadata(options?: RequestOptions): Promise<GenericMetadata>
}

export interface CrudServiceClass<T, ID, C extends object = object, U extends object = object> {
  readonly entityType: string

  new (api: Api): CrudService<T, ID, C, U>
}

/**
 * Generate a basic class implementing {@link CrudService} for a given entity type.
 * This class will use the following API endpoints of a Kiwi-Server application:
 * - `findById(id)` --> `GET /<entityType>/{id}`
 * - `findPage(filter)` --> `GET /<entityType>?{filter}`
 * - `create(...)` --> `POST /<entityType>`
 * - `update(id, ...)` --> `PATCH /<entityType>/{id}`
 * - `delete(id)` --> `DELETE /<entityType>/{id}`
 * - `fetchMetadata()` --> `GET /<entityType>/_schema`
 * @example ```ts
 * import type { ICreateTodoItem, ITodoItemDefault, IUpdateTodoItem, TodoItemId } from './demo.model'
 * class TodoItemService extends basicCrudService<ITodoItemDefault, TodoItemId, ICreateTodoItem, IUpdateTodoItem>(
 *   'TodoItem',
 * ) {}
 * ```
 */
export function basicCrudService<T, ID, C extends object = object, U extends object = object>(
  entityType: string,
): CrudServiceClass<T, ID, C, U> {
  function findRequestParams(options: FindPageOptions): RequestParams {
    const filterParams = options.filter || {}
    const optionParams = {
      _size: options.pageSize,
      _page: options.pageNumber,
      _sort: options.sort && sortParams(options.sort),
      _fields: options.fields,
      _fieldset: options.fieldset,
      _accelerate: options.accelerate,
    }
    return Object.assign({}, optionParams, filterParams)
  }

  function entityPath(id: ID): string {
    return `${entityType}/${encodeURIComponent(String(id))}`
  }

  return class BasicCrudService implements CrudService<T, ID, C, U> {
    static readonly entityType = entityType

    constructor(readonly api: Api) {}

    async findById<S extends T = T>(id: ID, options: FindOptions = {}): Promise<null | S> {
      const { signal } = options
      const response = await this.api.request(entityPath(id), findRequestParams(options), { method: 'GET', signal })
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
      const { signal } = options
      const response = await this.api.request(entityType, findRequestParams(options), { method: 'GET', signal })
      return unwrapResponseJson<IPage<S>>(response, options.accelerate)
    }

    async create<R = T>(body: C, { signal }: RequestOptions = {}): Promise<R> {
      const response = await this.api.jsonRequest(entityType, body, 'POST', {}, { signal })
      return unwrapResponseJson<R>(response)
    }

    async update<R = T>(id: ID, body: U, { signal }: RequestOptions = {}): Promise<R> {
      const response = await this.api.jsonRequest(entityPath(id), body, 'PATCH', {}, { signal })
      return unwrapResponseJson<R>(response)
    }

    async delete<R = T>(id: ID, { signal }: RequestOptions = {}): Promise<R> {
      const response = await this.api.request(entityPath(id), {}, { method: 'DELETE', signal })
      return unwrapResponseJson<R>(response)
    }

    async fetchMetadata({ signal }: RequestOptions = {}): Promise<GenericMetadata> {
      const response = await this.api.request(`${entityType}/_schema`, {}, { method: 'GET', signal })
      return unwrapResponseJson<GenericMetadata>(response)
    }
  }
}
