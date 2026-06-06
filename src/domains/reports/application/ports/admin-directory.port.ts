/** A resolved admin recipient (RBAC read model) — just what RPT needs to email + skip suspended ones. */
export interface AdminRecipient {
  id: string;
  email: string | null;
  /** RBAC admin status (`pending` | `active` | `suspended`); only `active` admins receive digests. */
  status: string;
}

/**
 * Read-only port over RBAC admin users (FR-RPT-071, §12.11). RPT resolves recipient emails and skips
 * non-active (suspended/pending) admins when sending scheduled digests. Real impl = a raw-SQL adapter
 * over `admin_users` (no coupling to RBAC's ORM classes), mirroring the other RPT read adapters.
 */
export interface IAdminDirectory {
  /** Resolve the given admin ids to recipients (missing ids are omitted). */
  resolve(adminIds: string[]): Promise<AdminRecipient[]>;
}

export const ADMIN_DIRECTORY = Symbol('IAdminDirectory');
