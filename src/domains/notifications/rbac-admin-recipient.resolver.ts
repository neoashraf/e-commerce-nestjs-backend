import { Injectable } from '@nestjs/common';

import { AdminDirectoryService } from '../rbac/application/services/admin-directory.service';
import { IAdminRecipientResolver } from './ports/admin-recipient-resolver.port';

/**
 * RBAC-backed {@link IAdminRecipientResolver}: delegates to {@link AdminDirectoryService} (exported by
 * RbacModule) to list active admins holding a permission. Keeps NOTIF's dispatch service decoupled
 * from RBAC internals (FR-NOTIF-070, BR-NOTIF-13).
 */
@Injectable()
export class RbacAdminRecipientResolver implements IAdminRecipientResolver {
  constructor(private readonly directory: AdminDirectoryService) {}

  findAdminIdsByPermission(permissionCode: string): Promise<string[]> {
    return this.directory.findActiveAdminIdsWithPermission(permissionCode);
  }
}
