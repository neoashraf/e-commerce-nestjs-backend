import { SetMetadata } from '@nestjs/common';

export const REQUIRES_PERMISSION = 'rbac:requires_permission';

/**
 * Declares the permission code an admin endpoint requires. Enforced by PermissionsGuard
 * (deny-by-default — FR-RBAC-031, 034). Every other admin module uses this on its routes.
 *
 * @example
 *   @UseGuards(JwtAdminGuard, PermissionsGuard)
 *   @Requires('orders.order.refund')
 */
export const Requires = (permission: string): MethodDecorator & ClassDecorator =>
  SetMetadata(REQUIRES_PERMISSION, permission);
