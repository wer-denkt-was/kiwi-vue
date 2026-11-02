import { describe, expect, it } from 'vitest'
import { AnalyticalReport } from '@/api'

const report = new AnalyticalReport({
  headers: ['list', 'status', 'count'],
  body: [
    ['A', 'Open', 2],
    ['A', 'Done', 3],
    ['B', 'Open', 5],
  ],
})

describe('AnalyticalReport', () => {
  it('provides columns by header or index', () => {
    expect(report.length).toBe(3)
    expect(report.headerIndex('status')).toBe(1)
    expect(report.headerIndex(2)).toBe(2)
    expect(report.columnArray('list')).toEqual(['A', 'A', 'B'])
    expect(report.columnSum(2)).toBe(10)
    expect(() => report.headerIndex('unknown')).toThrow('Unknown report header: unknown')
  })

  it('projects and extends columns', () => {
    const projected = report.projection([
      { header: 'list' },
      { header: 'count', project: value => (value as number) * 10 },
      { header: 'label', compute: row => `${row[0]}/${row[1]}` },
    ])
    expect(projected.headers).toEqual(['list', 'count', 'label'])
    expect(projected.body[0]).toEqual(['A', 20, 'A/Open'])

    const extended = report.extendColumns([{ header: 'double', compute: row => (row[2] as number) * 2 }])
    expect(extended.headers).toEqual(['list', 'status', 'count', 'double'])
    expect(extended.columnArray('double')).toEqual([4, 6, 10])
  })

  it('groups, pivots and aggregates rows', () => {
    expect([...report.groupBy('list').keys()]).toEqual(['A', 'B'])

    const pivot = report.pivot('list')
    expect(pivot.map(([key, sub]) => [key, sub.columnSum('count')])).toEqual([
      ['A', 5],
      ['B', 5],
    ])

    const aggregated = report.aggregate('status', [
      { header: 'total', aggregate: rows => rows.reduce((sum, row) => sum + (row[2] as number), 0) },
      { header: 'key', aggregate: (_, key) => String(key).toUpperCase() },
    ])
    expect(aggregated.headers).toEqual(['status', 'total', 'key'])
    expect(aggregated.body).toEqual([
      ['Open', 7, 'OPEN'],
      ['Done', 3, 'DONE'],
    ])
  })

  it('collates rows into records', () => {
    expect(report.collate()[2]).toEqual({ list: 'B', status: 'Open', count: 5 })
  })
})
