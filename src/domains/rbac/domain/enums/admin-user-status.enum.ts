/** Admin account lifecycle (SRS 16 §8 AdminUser.status). */
export enum AdminUserStatus {
  PENDING = 'pending',
  ACTIVE = 'active',
  SUSPENDED = 'suspended',
  DELETED = 'deleted',
}
