/**
 * Fixed permission catalog + seeded system-role definitions (SRS 16 §5.3/§5.4, Appendix A).
 *
 * Permission codes are `<module>.<resource>.<action>` and are defined HERE in code
 * (FR-RBAC-030, BR-RBAC-2) — admins assign existing codes to roles, never invent them.
 * Adding a new module later just appends to this catalog; the Super Admin role then
 * resolves to the new codes automatically (FR-RBAC-033) because it is treated as
 * implicitly-all rather than materialised into `role_permissions`.
 */

export interface PermissionDef {
  /** Stable identifier `<module>.<resource>.<action>` (primary key). */
  code: string;
  /** Owning module abbreviation (e.g. `CAT`, `ORD`). */
  module: string;
  /** Human-readable description. */
  description: string;
}

/** Build the read/create/update/delete codes for a resource. */
function crud(module: string, resource: string, label: string): PermissionDef[] {
  return [
    { code: `${resource}.read`, module, description: `View ${label}` },
    { code: `${resource}.create`, module, description: `Create ${label}` },
    { code: `${resource}.update`, module, description: `Update ${label}` },
    { code: `${resource}.delete`, module, description: `Delete ${label}` },
  ];
}

export const PERMISSION_CATALOG: PermissionDef[] = [
  // CAT — catalog (EAV model: categories, products, variants, images, attributes, families)
  ...crud('CAT', 'catalog.category', 'categories'),
  ...crud('CAT', 'catalog.product', 'products'),
  ...crud('CAT', 'catalog.variant', 'product variants'),
  ...crud('CAT', 'catalog.image', 'product images'),
  ...crud('CAT', 'catalog.attribute', 'attributes'),
  ...crud('CAT', 'catalog.attribute_family', 'attribute families'),

  // CART — cart & checkout settings (delivery zones, COD/geo configuration)
  { code: 'cart.settings.manage', module: 'CART', description: 'Manage delivery zones, charges, and geo overrides' },

  // INV — inventory (MVP stock slice)
  { code: 'inventory.stock.read', module: 'INV', description: 'View stock levels' },
  { code: 'inventory.stock.update', module: 'INV', description: 'Set/adjust stock and low-stock threshold' },

  // ORD — orders
  { code: 'orders.order.read', module: 'ORD', description: 'View orders' },
  { code: 'orders.order.update_status', module: 'ORD', description: 'Advance order status / fulfilment' },
  { code: 'orders.order.invoice', module: 'ORD', description: 'Generate order invoices' },
  { code: 'orders.order.refund', module: 'ORD', description: 'Issue order refunds' },
  { code: 'orders.exchange.read', module: 'ORD', description: 'View the exchange queue and detail' },
  { code: 'orders.exchange.review', module: 'ORD', description: 'Approve/reject and issue exchanges' },

  // CUST — customers
  { code: 'customers.customer.read', module: 'CUST', description: 'View/search customer records' },
  { code: 'customers.customer.update', module: 'CUST', description: 'Update customer (notes, tags, status)' },
  { code: 'customers.customer.export', module: 'CUST', description: 'Export customer data' },

  // LEAD — leads & contact
  { code: 'leads.lead.read', module: 'LEAD', description: 'View the lead inbox' },
  { code: 'leads.lead.respond', module: 'LEAD', description: 'Reply to leads' },
  { code: 'leads.lead.assign', module: 'LEAD', description: 'Assign leads' },

  // NOTIF — notifications (template manager)
  { code: 'notifications.template.read', module: 'NOTIF', description: 'View notification templates' },
  { code: 'notifications.template.create', module: 'NOTIF', description: 'Create notification templates' },
  { code: 'notifications.template.update', module: 'NOTIF', description: 'Edit notification templates (new version)' },
  { code: 'notifications.campaign.send', module: 'NOTIF', description: 'Send promotional campaigns and dry-run eligibility' },
  { code: 'notifications.log.read', module: 'NOTIF', description: 'View the delivery log and notification detail (incl. rendered PII)' },
  { code: 'notifications.log.resend', module: 'NOTIF', description: 'Resend a notification from the delivery log' },
  { code: 'notifications.settings.manage', module: 'NOTIF', description: 'Configure channel provider settings (SMS/email gateway, senders, quiet hours)' },

  // CMS — content
  ...crud('CMS', 'content.slider', 'sliders'),
  ...crud('CMS', 'content.banner', 'banners'),
  ...crud('CMS', 'content.page', 'pages'),
  ...crud('CMS', 'content.menu', 'menus'),

  // PROMO — promotions & coupons
  ...crud('PROMO', 'promotions.coupon', 'coupons'),

  // RPT — reports
  { code: 'reports.report.view', module: 'RPT', description: 'View reports' },
  { code: 'reports.report.export', module: 'RPT', description: 'Export reports' },

  // DASH — dashboard
  { code: 'dashboard.view', module: 'DASH', description: 'View the admin dashboard' },

  // RBAC — admin users, roles, audit log
  { code: 'rbac.admin_user.read', module: 'RBAC', description: 'View admin users' },
  { code: 'rbac.admin_user.create', module: 'RBAC', description: 'Invite admin users' },
  { code: 'rbac.admin_user.update', module: 'RBAC', description: 'Edit admin users' },
  { code: 'rbac.admin_user.suspend', module: 'RBAC', description: 'Suspend/reactivate admin users' },
  { code: 'rbac.admin_user.delete', module: 'RBAC', description: 'Delete admin users' },
  { code: 'rbac.role.read', module: 'RBAC', description: 'View roles and the permission catalog' },
  { code: 'rbac.role.create', module: 'RBAC', description: 'Create custom roles' },
  { code: 'rbac.role.update', module: 'RBAC', description: 'Edit roles and their permissions' },
  { code: 'rbac.role.delete', module: 'RBAC', description: 'Delete custom roles' },
  { code: 'rbac.audit.read', module: 'RBAC', description: 'View and export the audit log' },

  // SET — platform settings
  { code: 'settings.setting.read', module: 'SET', description: 'View platform settings' },
  { code: 'settings.setting.update', module: 'SET', description: 'Update platform settings' },
];

export const ALL_PERMISSION_CODES: string[] = PERMISSION_CATALOG.map((p) => p.code);

const PERMISSION_CODE_SET = new Set(ALL_PERMISSION_CODES);

/** Whether a code exists in the fixed catalog (used to validate role grants — FR-RBAC-021). */
export function isValidPermissionCode(code: string): boolean {
  return PERMISSION_CODE_SET.has(code);
}

/** A code is "read-only" when its action segment is `read` or `view`. */
function isReadCode(code: string): boolean {
  const action = code.split('.').pop();
  return action === 'read' || action === 'view';
}

type GrantLevel = 'full' | 'read';

/** Resolve the catalog codes for a `{ module: level }` grant spec (Appendix A). */
function grant(spec: Record<string, GrantLevel>): string[] {
  return PERMISSION_CATALOG.filter((p) => {
    const level = spec[p.module];
    if (!level) return false;
    return level === 'full' ? true : isReadCode(p.code);
  }).map((p) => p.code);
}

export const SUPER_ADMIN_ROLE_NAME = 'Super Admin';

export interface SystemRoleDef {
  name: string;
  description: string;
  /** `'ALL'` = implicit-all (Super Admin); otherwise the explicit code set. */
  permissions: string[] | 'ALL';
}

/** The four seeded, protected system roles (FR-RBAC-020, Appendix A). */
export const SYSTEM_ROLES: SystemRoleDef[] = [
  {
    name: SUPER_ADMIN_ROLE_NAME,
    description: 'Full access including admin-user, role, and settings management.',
    permissions: 'ALL',
  },
  {
    name: 'Catalog Manager',
    description: 'Manages catalog, inventory, content, and delivery/cart settings.',
    permissions: grant({ CAT: 'full', INV: 'full', CMS: 'full', CART: 'full', RPT: 'read', DASH: 'full' }),
  },
  {
    name: 'Order Manager',
    description: 'Manages orders, invoicing, customers, and leads.',
    permissions: grant({
      CAT: 'read',
      INV: 'read',
      ORD: 'full',
      CUST: 'full',
      LEAD: 'full',
      RPT: 'read',
      DASH: 'full',
    }),
  },
  {
    name: 'Marketing Manager',
    description: 'Manages promotions, content, and views reports.',
    permissions: grant({
      CAT: 'read',
      ORD: 'read',
      CUST: 'read',
      LEAD: 'read',
      CMS: 'full',
      PROMO: 'full',
      NOTIF: 'full',
      RPT: 'full',
      DASH: 'full',
    }),
  },
];
