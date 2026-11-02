/**
 * Built-in column filter operators of Kiwi-Server, see `GET /<entity>?<column>:<operator>=<values>`.
 * Column types may define further operators.
 * - `in`, `not`: column value is (not) one of the values
 * - `eq`, `ne`: column value is (not) equal to the value
 * - `null`: `true` if the column is null, `false` if it is not null
 * - `gt`, `ge`, `lt`, `le`: column value is greater/less than (or equal to) the value
 * - `contains`, `startsWith`: string column contains or starts with the value, matched literally
 */
export type ColumnFilterOperator =
  'in' | 'not' | 'eq' | 'ne' | 'null' | 'gt' | 'ge' | 'lt' | 'le' | 'contains' | 'startsWith' | (string & {})

export type ColumnFilterValue = string | number | boolean

/**
 * Create the query parameter of a column filter, to be passed as (part of) the `filter` of a paginated query.
 * The values are sent as a single comma-separated parameter, escaping commas and backslashes within values,
 * so values are matched as they are. Without any values, no filter parameter is created.
 * @param column Column name of the entity schema (case-insensitive)
 * @param operator Filter operator, or `undefined` for the default operator of the column (`in` for built-in types)
 * @param values Filter value or values
 * @example ```ts
 * todoItemService.findPage({
 *   filter: {
 *     ...columnFilter('status', 'in', ['Open', 'Done']), // status=Open,Done
 *     ...columnFilter('title', 'contains', 'Milk, 2l'), // title:contains=Milk\, 2l
 *     ...columnFilter('order', 'ge', 1), // order:ge=1
 *   },
 * })
 * ```
 */
export function columnFilter(
  column: string,
  operator: undefined | ColumnFilterOperator,
  values: ColumnFilterValue | ReadonlyArray<ColumnFilterValue>,
): Record<string, string> {
  const valueArray: ReadonlyArray<ColumnFilterValue> = Array.isArray(values) ? values : [values as ColumnFilterValue]
  if (valueArray.length === 0) return {}

  const name = operator ? `${column}:${operator}` : column
  const value = valueArray.map(value => String(value).replace(/[\\,]/g, char => `\\${char}`)).join(',')
  return { [name]: value }
}
