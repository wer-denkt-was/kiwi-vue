import type { IPage, Pagination, Sort } from '@/api/page.model'

// This assumes that entities commonly have a sortable field named "id"
const defaultSort: Sort = { field: 'id', direction: 'asc' }

interface Options<T> {
  loadPage(pagination: Pagination): Promise<IPage<T>>

  pageSize?: number
  sort?: Sort
}

/**
 * Helper function to load items of a paginated dataset across all pages
 */
export async function loadAllPages<T>(options: Options<T>): Promise<ReadonlyArray<T>> {
  const { pageSize = 100, sort = defaultSort } = options
  const loadPage = (pageNumber: number) => options.loadPage({ pageNumber, pageSize, sort: [sort] })

  // Load first page to obtain pagination info
  const firstPage = await loadPage(0)

  // Exit early if first page is complete
  if (pageSize >= firstPage.totalItems) {
    return firstPage.items
  }

  // Load all remaining pages at once
  const remainingPages = await Promise.all(range(1, firstPage.totalPages).map(loadPage))

  // Merge and return all loaded page items
  return firstPage.items.concat(remainingPages.flatMap(page => page.items))
}

function range(from: number, until: number): Array<number> {
  const range = new Array(Math.max(0, until - from))
  for (let i = 0; i < range.length; i++) {
    range[i] = from + i
  }
  return range
}
