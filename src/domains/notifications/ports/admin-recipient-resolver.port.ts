/**
 * Outbound port: resolve the set of admins that should receive an in-app notification for a given
 * RBAC permission (FR-NOTIF-070, BR-NOTIF-13). The real adapter is backed by RBAC; kept as a port so
 * the dispatch service is unit-testable without the RBAC module.
 */
export interface IAdminRecipientResolver {
  /** Active admin ids whose role grants `permissionCode` (Super Admin = implicit-all). */
  findAdminIdsByPermission(permissionCode: string): Promise<string[]>;
}

export const ADMIN_RECIPIENT_RESOLVER = Symbol('IAdminRecipientResolver');
