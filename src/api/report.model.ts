import type { Sort } from '@/api/page.model'

export interface AnalyticalReportQuery {
  dimensions: ReadonlyArray<string>
  metrics: ReadonlyArray<string>
  slices: Readonly<Record<string, Slice>>
  sort?: ReadonlyArray<Sort>
}

export interface Slice {
  /** Equal to value */
  eq?: unknown
  /** Greater than */
  gt?: unknown
  /** Less than */
  lt?: unknown
  /** Greater or equal */
  ge?: unknown
  /** Less or equal */
  le?: unknown
  /** In list of values */
  in?: ReadonlyArray<unknown>
  /** Is null */
  null?: boolean
  /** Conjunction */
  and?: ReadonlyArray<Slice>
  /** Disjunction */
  or?: ReadonlyArray<Slice>
  /** Negation */
  not?: Slice
}

export interface IAnalyticalReport {
  readonly headers: ReadonlyArray<string>
  readonly body: ReadonlyArray<AnalyticalReport.Row>
}

export class AnalyticalReport implements IAnalyticalReport {
  constructor(private readonly data: IAnalyticalReport) {}

  get headers() {
    return this.data.headers
  }

  get body() {
    return this.data.body
  }

  get length() {
    return this.data.body.length
  }

  headerIndex(header: number | string): number {
    if (typeof header === 'number') return header
    const index = this.headers.indexOf(header)
    if (index < 0) throw new Error(`Unknown report header: ${header}`)
    return index
  }

  columnArray<R>(headerOrIndex: number | string): R[] {
    const index = this.headerIndex(headerOrIndex)
    return this.body.map(row => row[index] as R)
  }

  columnSum(headerOrIndex: number | string): number {
    return this.columnArray<number>(headerOrIndex).reduce((a, b) => a + b, 0)
  }

  projection(columns: ReadonlyArray<AnalyticalReport.ColumnProjection>): AnalyticalReport {
    type ColumnMapper = (row: ReadonlyArray<unknown>) => unknown
    const columnMappers = columns.map((column): ColumnMapper => {
      if ('compute' in column) return row => column.compute(row)
      const columnIndex = this.headerIndex(column.header)
      if ('project' in column) return row => column.project(row[columnIndex])
      return row => row[columnIndex]
    })

    const headers = columns.map(column => column.header)
    const body = this.body.map(row => columnMappers.map(mapper => mapper(row)))

    return new AnalyticalReport({ headers, body })
  }

  extendColumns(addColumns: ReadonlyArray<AnalyticalReport.ColumnProjection>): AnalyticalReport {
    const existingColumns = this.headers.map(header => ({ header }) satisfies AnalyticalReport.ColumnProjection)
    return this.projection([...existingColumns, ...addColumns])
  }

  pivot(headerOrIndex: number | string): Array<AnalyticalReport.PivotEntry> {
    const headers = this.headers
    const pivot = this.groupBy(headerOrIndex)

    // Map groups to sub-reports
    const result: Array<AnalyticalReport.PivotEntry> = []
    pivot.forEach((body, key) => {
      const report = new AnalyticalReport({ headers, body })
      result.push([key, report])
    })
    return result
  }

  aggregate(
    headerOrIndex: number | string,
    aggregations: ReadonlyArray<AnalyticalReport.ColumnAggregation>,
  ): AnalyticalReport {
    // Compute headers of aggregated report
    const groupHeader = this.headers[this.headerIndex(headerOrIndex)] ?? ''
    const aggregateHeaders = aggregations.map(aggregation => aggregation.header)
    const headers = [groupHeader, ...aggregateHeaders]

    // Aggregate groups into a new report
    const groups = this.groupBy(headerOrIndex)
    const body: Array<ReadonlyArray<unknown>> = []
    groups.forEach((groupRows, groupKey) => {
      const groupValues = aggregations.map(aggregation => aggregation.aggregate(groupRows, groupKey))
      body.push([groupKey, ...groupValues])
    })

    return new AnalyticalReport({ headers, body })
  }

  groupBy(headerOrIndex: number | string): Map<PropertyKey, Array<AnalyticalReport.Row>> {
    // Group rows by pivot column
    const groups = new Map<PropertyKey, Array<ReadonlyArray<unknown>>>()
    const groupByIndex = this.headerIndex(headerOrIndex)
    this.body.forEach(row => {
      const key = row[groupByIndex] as PropertyKey
      const group = groups.get(key)
      if (group) {
        group.push(row)
      } else {
        groups.set(key, [row])
      }
    })
    return groups
  }

  collate(): Array<AnalyticalReport.CollatedRow> {
    return this.body.map(row => {
      return Object.fromEntries(
        row.map((value, columnIndex) => {
          const key = this.headers[columnIndex]
          return [key, value] as const
        }),
      )
    })
  }
}

// eslint-disable-next-line @typescript-eslint/no-namespace
export namespace AnalyticalReport {
  export type Row = ReadonlyArray<unknown>
  export type CollatedRow = Readonly<Record<string, unknown>>

  export type ColumnProjection =
    | { readonly header: string }
    | { readonly header: string; readonly project: (value: unknown) => unknown }
    | { readonly header: string; readonly compute: (row: ReadonlyArray<unknown>) => unknown }

  export type PivotEntry = readonly [PropertyKey, AnalyticalReport]

  export type ColumnAggregation = {
    readonly header: string
    readonly aggregate: (rows: ReadonlyArray<ReadonlyArray<unknown>>, groupKey: PropertyKey) => unknown
  }
}
