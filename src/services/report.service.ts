import { Sort } from '@/api/page.model'
import { AnalyticalReport, AnalyticalReportQuery, IAnalyticalReport } from '@/api/report.model'
import { Api, RequestParams, unwrapResponseJson } from '@/services/api.service'

export interface AnalyticalReportService {
  queryReport(query: AnalyticalReportQuery): Promise<AnalyticalReport>
}

interface AnalyticalReportServiceClass {
  new (api: Api): AnalyticalReportService
}

export function basicReportService(entityType: string): AnalyticalReportServiceClass {
  function sortParam(sort: Sort): string {
    return `${sort.field},${sort.direction}`
  }

  function reportQueryParams(query: AnalyticalReportQuery): RequestParams {
    const params: RequestParams = {
      _dimensions: query.dimensions.join(','),
      _metrics: query.metrics.join(','),
      _sort: query.sort?.map(sortParam),
    }
    Object.entries(query.slices).forEach(([sliceName, slice]) => {
      params[sliceName] = JSON.stringify(slice)
    })
    return params
  }

  return class BasicReportService implements AnalyticalReportService {
    constructor(private readonly api: Api) {}

    async queryReport(query: AnalyticalReportQuery): Promise<AnalyticalReport> {
      const endpoint = `/${entityType}/_report`
      const queryParams = reportQueryParams(query)
      const response = await this.api.request(endpoint, queryParams, { method: 'GET' })
      const reportData = await unwrapResponseJson<IAnalyticalReport>(response, false)
      return new AnalyticalReport(reportData)
    }
  }
}
