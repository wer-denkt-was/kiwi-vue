import { sortParams } from '@/api/page.model'
import { AnalyticalReport, AnalyticalReportQuery, AnalyticalReportSchema, IAnalyticalReport } from '@/api/report.model'
import { Api, RequestParams, unwrapResponseJson } from '@/services/api.service'
import type { RequestOptions } from '@/services/crud.service'

export interface AnalyticalReportService {
  /** Query an analytical report: `GET /<entityType>/_report` */
  queryReport(query: AnalyticalReportQuery, options?: RequestOptions): Promise<AnalyticalReport>

  /** Load the available dimensions and metrics of the report: `GET /<entityType>/_report/_schema` */
  fetchReportSchema(options?: RequestOptions): Promise<AnalyticalReportSchema>
}

export interface AnalyticalReportServiceClass {
  readonly entityType: string

  new (api: Api): AnalyticalReportService
}

export function basicReportService(entityType: string): AnalyticalReportServiceClass {
  function reportQueryParams(query: AnalyticalReportQuery): RequestParams {
    const params: Record<string, RequestParams[string]> = {
      _dimensions: query.dimensions.join(','),
      _metrics: query.metrics.join(','),
      _sort: query.sort && sortParams(query.sort),
    }
    Object.entries(query.slices).forEach(([sliceName, slice]) => {
      params[sliceName] = JSON.stringify(slice)
    })
    return params
  }

  return class BasicReportService implements AnalyticalReportService {
    static readonly entityType = entityType

    constructor(private readonly api: Api) {}

    async queryReport(query: AnalyticalReportQuery, { signal }: RequestOptions = {}): Promise<AnalyticalReport> {
      const endpoint = `${entityType}/_report`
      const response = await this.api.request(endpoint, reportQueryParams(query), { method: 'GET', signal })
      const reportData = await unwrapResponseJson<IAnalyticalReport>(response, false)
      return new AnalyticalReport(reportData)
    }

    async fetchReportSchema({ signal }: RequestOptions = {}): Promise<AnalyticalReportSchema> {
      const endpoint = `${entityType}/_report/_schema`
      const response = await this.api.request(endpoint, {}, { method: 'GET', signal })
      return unwrapResponseJson<AnalyticalReportSchema>(response)
    }
  }
}
