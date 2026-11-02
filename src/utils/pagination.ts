import type { IPage, Pagination, Sort } from '@/api/page.model'

// This assumes that entities commonly have a sortable field named "id"
const defaultSort: Sort = { field: 'id', direction: 'asc' }

/**
 * Options of {@link loadAllPages}
 * @property loadPage Function loading a single page
 * @property pageSize Number of items per page, defaults to 100
 * @property sort Sorting order, defaults to sorting by `id` ascending. Use a total order, as the pages are loaded
 * concurrently, and items could otherwise appear on several pages.
 */
export interface LoadAllPagesOptions<T> {
  pageSize?: number
  sort?: Sort | ReadonlyArray<Sort>

  loadPage(pagination: Pagination): Promise<IPage<T>>
}

/**
 * Helper function to load items of a paginated dataset across all pages
 */
export async function loadAllPages<T>(options: LoadAllPagesOptions<T>): Promise<ReadonlyArray<T>> {
  const { pageSize = 100, sort = defaultSort } = options
  const sortArray: ReadonlyArray<Sort> = Array.isArray(sort) ? sort : [sort as Sort]
  const loadPage = (pageNumber: number) => options.loadPage({ pageNumber, pageSize, sort: sortArray })

  // Load first page to obtain pagination info
  const firstPage = await loadPage(0)

  // Exit early if first page is complete.
  // The server may cap the page size (`kiwi.pagination.max-page-size`), so the requested page size is not relevant.
  if (firstPage.totalPages <= 1) {
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
