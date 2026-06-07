import { randomUUID } from 'crypto';
import { BadRequestException, Inject, Injectable } from '@nestjs/common';

import { Role } from '../../domain/entities/role.entity';
import { AuditResult } from '../../domain/enums/audit-result.enum';
import { isValidPermissionCode } from '../../domain/permission-catalog';
import { IRoleRepository, ROLE_REPOSITORY } from '../../domain/repositories/role.repository.interface';
import { AuditService } from '../services/audit.service';

export interface CreateRoleCommand {
  actorAdminId: string;
  name: string;
  description?: string;
  permissions: string[];
  ipAddress?: string | null;
}

/** Create a custom role (FR-RBAC-021): unique name + valid catalog codes. */
@Injectable()
export class CreateRoleUseCase {
  constructor(
    @Inject(ROLE_REPOSITORY) private readonly roles: IRoleRepository,
    private readonly audit: AuditService,
  ) {}

  async execute(command: CreateRoleCommand): Promise<{ id: string; name: string }> {
    const now = new Date();
    const name = command.name.trim();

    if (await this.roles.findByName(name)) {
      throw new BadRequestException({ code: 'DUPLICATE_ROLE_NAME', message: 'A role with this name already exists.' });
    }
    this.assertValidCodes(command.permissions);

    const role = await this.roles.saveRole(
      new Role(randomUUID(), name, command.description ?? null, false, now, now, null),
    );
    await this.roles.replacePermissions(role.id, this.dedupe(command.permissions));

    await this.audit.record({
      actorAdminId: command.actorAdminId,
      action: 'rbac.role.create',
      result: AuditResult.SUCCESS,
      entityType: 'Role',
      entityId: role.id,
      summary: { name, permissionCount: this.dedupe(command.permissions).length },
      ipAddress: command.ipAddress ?? null,
    });

    return { id: role.id, name: role.name };
  }

  private assertValidCodes(codes: string[]): void {
    const invalid = codes.filter((c) => !isValidPermissionCode(c));
    if (invalid.length > 0) {
      throw new BadRequestException({
        code: 'INVALID_PERMISSION',
        message: `Unknown permission code(s): ${invalid.join(', ')}`,
      });
    }
  }

  private dedupe(codes: string[]): string[] {
    return [...new Set(codes)];
  }
}
