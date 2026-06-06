/**
 * Canonical business-metric definition (SRS 15 §4 "Metric", §8 MetricDefinition). RPT owns these as a
 * code-maintained registry (BR-RPT-1) — the single source `DASH` reuses verbatim (FR-RPT-003) so the
 * dashboard and reports can never disagree. Conceptual/read-only: no DB table, versioned in code.
 */
export interface MetricDefinition {
  /** Stable key, e.g. `net_revenue`, `aov`, `ltv`. */
  key: string;
  /** Display label. */
  label: string;
  /** Human-readable formula. */
  formula: string;
  /** What is included/excluded (refunds, cancelled, etc.). */
  inclusion_rules: string;
}
