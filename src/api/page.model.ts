/**
 * Data object representing a single page from a paginated dataset,
 * received as a paginated request specified using a {@link Pagination}.
 * @property items List of items present on this page, with a page size less than or equal to `pageSize`
 * @property pageSize Requested number of items per page
 * @property pageNumber Page number requested
 * @property totalPages How many pages in total are present in the dataset
 * @property totalItems How many items in total are present in the dataset
 */
export interface IPage<T> {
  readonly items: ReadonlyArray<T>
  readonly pageSize: number
  readonly pageNumber: number
  readonly totalPages: number
  readonly totalItems: number
}

/**
 * Data object representing the pagination of a dataset.
 * @property pageNumber Requested page number, with 0 being the first page
 * @property pageSize Requested number of items per page
 * @property sort Sorting applied to the dataset before pagination, with the list being applied as highest-to-lowest sorting priority
 */
export interface Pagination {
  readonly pageNumber: number
  readonly pageSize: number
  readonly sort: ReadonlyArray<Sort>
}

/**
 * Data object representing the sorting order of a dataset.
 * @property field Field name to sort the dataset by, i.e. by ID, by name or by other attribute
 * @property direction Sorting direction, either ascending ('asc') or descending ('desc')
 */
export interface Sort {
  readonly field: string
  readonly direction: 'asc' | 'desc'
}
