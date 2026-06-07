/**
 * Marker for a response whose `data` is a single object AND that also carries a sibling `meta`
 * (e.g. SRCH listing/search: `{ data: { scope, products, … }, meta: { page, limit, total } }`).
 * Distinct from {@link Paginated} (whose `data` is the items array). The global ResponseInterceptor
 * renders it as `{ data, meta }` without re-wrapping (SRS §7).
 */
export class DataWithMeta<T, M = { page: number; limit: number; total: number }> {
  constructor(
    public readonly data: T,
    public readonly meta: M,
  ) {}
}
