import { FacetSource, FacetType } from '../../domain/search-enums';

/** A resolved facet value with its live count (contract: facets[].values[]). */
export interface FacetValue {
  value: string;
  label: string;
  count: number;
  color_hex?: string;
}

/** A rendered facet block (contract: facets[]). Range carries min/max; boolean carries a single count. */
export interface FacetBlock {
  key: string;
  label: string;
  type: FacetType;
  multi_select?: boolean;
  values?: FacetValue[];
  min?: string;
  max?: string;
  count?: number;
}

/** A facet definition resolved as applicable to the current listing/search scope, ordered. */
export interface ResolvedFacet {
  key: string;
  label: string;
  type: FacetType;
  source: FacetSource;
  sourceAttributeKey: string | null;
  isMultiSelect: boolean;
  hideZeroCounts: boolean;
  displayOrder: number;
}

/**
 * Parsed active filter selections from the querystring, keyed by facet key. Term/boolean values are
 * string arrays; the price range is min/max numbers. Built by the filter service from raw params,
 * ignoring unknown keys/malformed values (FR-SRCH-051).
 */
export interface ParsedFilters {
  terms: Map<string, string[]>;
  priceMin?: number;
  priceMax?: number;
  inStockOnly: boolean;
  onSaleOnly: boolean;
}
