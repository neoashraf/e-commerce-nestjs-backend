import { RecentLead } from '../../domain/summary.types';

/**
 * LEAD read port (FR-DASH-012/021). New/unassigned lead count for the alert and recent leads.
 * Real impl integrates with the Leads module inbox read side. See the stub adapter for the
 * representative implementation pending wiring.
 */
export interface LeadsDashboardPort {
  /** Count of new/unassigned leads (current state). */
  getNewLeadCount(): Promise<number>;
  /** Most recent leads (newest first). */
  getRecentLeads(limit: number): Promise<RecentLead[]>;
}

export const LEADS_DASHBOARD_PORT = Symbol('DashboardLeadsPort');
