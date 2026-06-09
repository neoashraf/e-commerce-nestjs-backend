/**
 * Search-index write seam (SRCH). CAT calls this to (re)project or drop a product's storefront search
 * document on publish / unpublish / archive / soft-delete (FR-SRCH-070/072). Implemented by an adapter
 * that delegates to SRCH's indexer; failures degrade gracefully (the reindex job is the backstop), so an
 * index hiccup never fails a catalog write.
 */
export const SEARCH_INDEX_PORT = Symbol('SEARCH_INDEX_PORT');

export interface ISearchIndexPort {
  /** (Re)project a product into the index, or remove it when it is no longer searchable. */
  upsert(productId: string): Promise<void>;
  /** Remove a product from the index. */
  remove(productId: string): Promise<void>;
}
