import { Injectable } from '@nestjs/common';

import { RecentLead } from '../../domain/summary.types';
import { LeadsDashboardPort } from '../../application/ports/leads-dashboard.port';

/**
 * LEAD read-port stub (FR-DASH-012/021). Representative new/unassigned lead count and recent leads.
 *
 * TODO-INTEGRATION (LEAD): replace with a real adapter over the Leads inbox read side — count
 * `new`/unassigned leads and list the most recent submissions.
 */
@Injectable()
export class LeadsDashboardStubAdapter implements LeadsDashboardPort {
  async getNewLeadCount(): Promise<number> {
    return 7;
  }

  async getRecentLeads(limit: number): Promise<RecentLead[]> {
    const sample: RecentLead[] = [
      { lead_id: 'stub-lead-1', subject: 'Size exchange request', status: 'new', created_at: '2026-06-04T09:10:00Z' },
      { lead_id: 'stub-lead-2', subject: 'Delivery time enquiry', status: 'new', created_at: '2026-06-04T08:02:00Z' },
      { lead_id: 'stub-lead-3', subject: 'Bulk order for club', status: 'assigned', created_at: '2026-06-03T16:40:00Z' },
    ];
    return sample.slice(0, Math.max(0, limit));
  }
}
