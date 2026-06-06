import { EligibilityScope } from '../domain/promo-enums';
import { toPaisa } from './money';

/**
 * A single cart line as supplied by CART for coupon validation. Prices are the effective
 * post-catalog-sale unit prices (BR-PROMO-10), as Decimal(12,2) strings.
 */
export interface CartLine {
  product_id: string;
  category_id?: string | null;
  quantity: number;
  effective_unit_price: string;
}

/**
 * Compute the eligible subtotal (in integer paisa) for a coupon's scope (FR-PROMO-011,
 * BR-PROMO-3). `all` → every line; `include` → only lines whose product OR category is
 * in the target set; `exclude` → every line whose product AND category are NOT excluded.
 * Excluded lines contribute nothing to the discount base (§12.4).
 */
export function computeEligibleSubtotalPaisa(
  lines: CartLine[],
  scope: EligibilityScope,
  categoryIds: string[],
  productIds: string[],
): number {
  const cats = new Set(categoryIds);
  const prods = new Set(productIds);

  let total = 0;
  for (const line of lines) {
    if (isLineEligible(line, scope, cats, prods)) {
      total += toPaisa(line.effective_unit_price) * line.quantity;
    }
  }
  return total;
}

function isLineEligible(
  line: CartLine,
  scope: EligibilityScope,
  cats: Set<string>,
  prods: Set<string>,
): boolean {
  if (scope === EligibilityScope.ALL) return true;

  const matchesTarget =
    prods.has(line.product_id) || (line.category_id != null && cats.has(line.category_id));

  if (scope === EligibilityScope.INCLUDE) return matchesTarget;
  // EXCLUDE: eligible only when the line does NOT match an excluded target.
  return !matchesTarget;
}
