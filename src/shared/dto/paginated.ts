/**
 * Marker for a paginated result. The global ResponseInterceptor renders it as the SRS
 * envelope `{ data: items, meta: { page, limit, total } }` (SRS §7). Return one from any
 * list controller to get the paginated envelope without hand-wrapping.
 */
export class Paginated<T> {
  constructor(
    public readonly items: T[],
    public readonly meta: { page: number; limit: number; total: number },
  ) {}
}
