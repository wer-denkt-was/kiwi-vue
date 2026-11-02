/**
 * Metadata of an entity's generic queries and commands, as returned by `GET /<entity>/_schema`.
 * Can be used by generic frontend components, e.g. to render forms from the body properties of create and update
 * commands. Descriptors are `null` if the entity has no corresponding query, schema or command.
 * @property entityName Entity name, as used in the entity's endpoint paths
 * @property entityClassName Fully qualified class name of the entity
 */
export interface GenericMetadata {
  readonly entityName: string
  readonly entityClassName: string
  readonly query: null | GenericMetadata.QueryDescriptor
  readonly schema: null | GenericMetadata.SchemaDescriptor
  readonly create: null | GenericMetadata.CreateDescriptor
  readonly update: null | GenericMetadata.UpdateDescriptor
  readonly delete: null | GenericMetadata.DeleteDescriptor
}

// eslint-disable-next-line @typescript-eslint/no-namespace
export namespace GenericMetadata {
  /** Body properties of a create command, keyed by their JSON key */
  export interface CreateDescriptor {
    readonly commandClassName: string
    readonly properties: Readonly<Record<string, PropertyInfo>>
  }

  /** Body properties of an update command, keyed by their JSON key */
  export interface UpdateDescriptor {
    readonly commandClassName: string
    readonly idClassName: string
    readonly properties: Readonly<Record<string, PropertyInfo>>
  }

  export interface DeleteDescriptor {
    readonly commandClassName: string
    readonly idClassName: string
  }

  /** Filter properties of the entity query, which can be passed as query parameters */
  export interface QueryDescriptor {
    readonly queryClassName: string
    readonly filterProperties: Readonly<Record<string, PropertyInfo>>
  }

  export interface SchemaDescriptor {
    readonly schemaClassName: string
    readonly fieldsets: ReadonlyArray<string>
    readonly columnProperties: Readonly<Record<string, PropertyInfo>>
    readonly toOneRelations: Readonly<Record<string, RelationInfo>>
    readonly toManyRelations: Readonly<Record<string, RelationInfo>>
    readonly toManyMapRelations: Readonly<Record<string, RelationPairInfo>>
    readonly subtypeProperties: Readonly<Record<string, SchemaDescriptor>>
  }

  /**
   * @property valueClassName Value type of the property
   * @property description Human-readable description of the value type
   * @property required If the property must be present, e.g. a required body property of a create command
   */
  export interface PropertyInfo {
    readonly valueClassName: string
    readonly description: string
    readonly required: boolean
  }

  export interface RelationInfo {
    readonly entityName: string
    readonly entityClassName: string
  }

  export interface RelationPairInfo {
    readonly key: RelationInfo
    readonly value: RelationInfo
  }
}
