import { Injectable } from '@nestjs/common';

import { MetricDefinition } from '../../domain/metric-definition';
import { METRIC_DEFINITIONS } from '../../domain/metrics.registry';

/**
 * Expose the canonical metric registry (FR-RPT-001/003, BR-RPT-1). DASH consumes these definitions
 * verbatim so dashboard and report figures match exactly. Pure read of the in-code registry.
 */
@Injectable()
export class GetMetricsUseCase {
  execute(): MetricDefinition[] {
    return [...METRIC_DEFINITIONS];
  }
}
