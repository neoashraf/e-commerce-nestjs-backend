import { MetricDefinition } from './metric-definition';

/**
 * The canonical metric registry (FR-RPT-001/003, BR-RPT-1). Every figure surfaced by RPT or reused by
 * DASH is defined here once, with an explicit formula + inclusion rules, so the dashboard and reports
 * agree by construction. Money figures are BDT. Conventions referenced below:
 *  - Net Revenue counts online `paid` + COD `cod_collected` order grand totals, net of refunds, and
 *    excludes cancelled/unpaid orders (BR-RPT-2). Refunds reduce the period they occur in (§12.3).
 *  - Gross Placed Value is reported separately and never conflated with revenue (BR-RPT-3).
 *  - A returning customer has ≥ 1 prior completed order before the period order (BR-RPT-8).
 */
export const METRIC_DEFINITIONS: readonly MetricDefinition[] = [
  {
    key: 'net_revenue',
    label: 'Net Revenue',
    formula: 'Σ(paid/collected grand_total) − Σ(refunds)',
    inclusion_rules: 'Excludes cancelled/unpaid; refunds reduce the period they occur in.',
  },
  {
    key: 'gross_placed_value',
    label: 'Gross Placed Value',
    formula: 'Σ(grand_total of all placed orders)',
    inclusion_rules: 'Includes unpaid; reported separately, not revenue.',
  },
  {
    key: 'orders',
    label: 'Orders',
    formula: 'count(paid/collected orders)',
    inclusion_rules: 'Paid/collected orders only; excludes cancelled/unpaid.',
  },
  {
    key: 'units_sold',
    label: 'Units Sold',
    formula: 'Σ(order_item.quantity) over paid/collected orders',
    inclusion_rules: 'Paid/collected orders only.',
  },
  {
    key: 'aov',
    label: 'Average Order Value',
    formula: 'net_revenue / paid_orders',
    inclusion_rules: 'Paid/collected orders only; 0 when there are no paid orders.',
  },
  {
    key: 'new_customers',
    label: 'New Customers',
    formula: 'count(customers whose first completed order falls in the period)',
    inclusion_rules: 'First-ever completed order within the period.',
  },
  {
    key: 'returning_customers',
    label: 'Returning Customers',
    formula: 'count(customers with ≥ 1 prior completed order before the period order)',
    inclusion_rules: 'Prior completed order before the period (BR-RPT-8).',
  },
  {
    key: 'ltv',
    label: 'Customer LTV',
    formula: 'Σ(net revenue attributable to the customer over all time)',
    inclusion_rules: 'Lifetime net revenue per customer; paid/collected, net of refunds.',
  },
  {
    key: 'refund_total',
    label: 'Refund Total',
    formula: 'Σ(completed refunds in the period)',
    inclusion_rules: 'Refunds attributed to the period they are processed in (§12.3).',
  },
  {
    key: 'discount_total',
    label: 'Discount Total',
    formula: 'Σ(order.discount_amount over paid/collected orders)',
    inclusion_rules: 'Coupon/discount applied on paid/collected orders.',
  },
];
