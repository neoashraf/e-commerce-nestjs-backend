import { forwardRef, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { TypeOrmModule } from '@nestjs/typeorm';

import { requireEnv } from '../../shared/config/require-env';
import { NotificationsModule } from '../notifications/notifications.module';

// domain repository tokens
import { ADMIN_USER_REPOSITORY } from './domain/repositories/admin-user.repository.interface';
import { ROLE_REPOSITORY } from './domain/repositories/role.repository.interface';
import { ADMIN_SESSION_REPOSITORY } from './domain/repositories/admin-session.repository.interface';
import { TWOFA_CHALLENGE_REPOSITORY } from './domain/repositories/twofa-challenge.repository.interface';
import { PASSWORD_RESET_TOKEN_REPOSITORY } from './domain/repositories/password-reset-token.repository.interface';
import { AUDIT_REPOSITORY } from './domain/repositories/audit.repository.interface';

// application ports
import { PASSWORD_HASHER } from './application/ports/password-hasher.port';
import { ADMIN_TOKEN_SERVICE } from './application/ports/admin-token-service.port';
import { ADMIN_OTP_SERVICE } from './application/ports/admin-otp.port';
import { ADMIN_NOTIFICATION_DISPATCHER } from './application/ports/admin-notification.port';

// application services + use cases
import { PermissionService } from './application/services/permission.service';
import { AuditService } from './application/services/audit.service';
import { SessionIssuerService } from './application/services/session-issuer.service';
import { AdminLoginUseCase } from './application/use-cases/admin-login.use-case';
import { Verify2faUseCase } from './application/use-cases/verify-2fa.use-case';
import { RefreshAdminTokenUseCase } from './application/use-cases/refresh-admin-token.use-case';
import { AdminLogoutUseCase } from './application/use-cases/admin-logout.use-case';
import { ForgotPasswordUseCase } from './application/use-cases/forgot-password.use-case';
import { ResetPasswordUseCase } from './application/use-cases/reset-password.use-case';
import { GetAdminMeUseCase } from './application/use-cases/get-admin-me.use-case';
import { UpdateAdminProfileUseCase } from './application/use-cases/update-admin-profile.use-case';
import { ChangeAdminPasswordUseCase } from './application/use-cases/change-admin-password.use-case';
import { UpdateAdmin2faUseCase } from './application/use-cases/update-admin-2fa.use-case';
import { AdminUserPolicyService } from './application/services/admin-user-policy.service';
import { ListAdminUsersUseCase } from './application/use-cases/list-admin-users.use-case';
import { InviteAdminUserUseCase } from './application/use-cases/invite-admin-user.use-case';
import { UpdateAdminUserUseCase } from './application/use-cases/update-admin-user.use-case';
import { SuspendAdminUserUseCase } from './application/use-cases/suspend-admin-user.use-case';
import { ReactivateAdminUserUseCase } from './application/use-cases/reactivate-admin-user.use-case';
import { DeleteAdminUserUseCase } from './application/use-cases/delete-admin-user.use-case';
import { ResendInviteUseCase } from './application/use-cases/resend-invite.use-case';
import { ListRolesUseCase } from './application/use-cases/list-roles.use-case';
import { GetRoleUseCase } from './application/use-cases/get-role.use-case';
import { CreateRoleUseCase } from './application/use-cases/create-role.use-case';
import { UpdateRoleUseCase } from './application/use-cases/update-role.use-case';
import { DeleteRoleUseCase } from './application/use-cases/delete-role.use-case';
import { ListAuditUseCase } from './application/use-cases/list-audit.use-case';

// infrastructure
import { rbacConfigProvider } from './infrastructure/config/rbac-config.provider';
import { AdminUserOrmEntity } from './infrastructure/persistence/typeorm/entities/admin-user.orm-entity';
import { RoleOrmEntity } from './infrastructure/persistence/typeorm/entities/role.orm-entity';
import { PermissionOrmEntity } from './infrastructure/persistence/typeorm/entities/permission.orm-entity';
import { RolePermissionOrmEntity } from './infrastructure/persistence/typeorm/entities/role-permission.orm-entity';
import { AdminSessionOrmEntity } from './infrastructure/persistence/typeorm/entities/admin-session.orm-entity';
import { AuditEntryOrmEntity } from './infrastructure/persistence/typeorm/entities/audit-entry.orm-entity';
import { TwofaChallengeOrmEntity } from './infrastructure/persistence/typeorm/entities/twofa-challenge.orm-entity';
import { PasswordResetTokenOrmEntity } from './infrastructure/persistence/typeorm/entities/password-reset-token.orm-entity';
import { TypeOrmAdminUserRepository } from './infrastructure/persistence/typeorm/repositories/typeorm-admin-user.repository';
import { TypeOrmRoleRepository } from './infrastructure/persistence/typeorm/repositories/typeorm-role.repository';
import { TypeOrmAdminSessionRepository } from './infrastructure/persistence/typeorm/repositories/typeorm-admin-session.repository';
import { TypeOrmTwofaChallengeRepository } from './infrastructure/persistence/typeorm/repositories/typeorm-twofa-challenge.repository';
import { TypeOrmPasswordResetTokenRepository } from './infrastructure/persistence/typeorm/repositories/typeorm-password-reset-token.repository';
import { TypeOrmAuditRepository } from './infrastructure/persistence/typeorm/repositories/typeorm-audit.repository';
import { BcryptPasswordHasher } from './infrastructure/services/bcrypt-password-hasher.service';
import { AdminJwtTokenService } from './infrastructure/services/admin-jwt-token.service';
import { AdminOtpService } from './infrastructure/services/admin-otp.service';
import { NotifAdminNotificationService } from './infrastructure/services/notif-admin-notification.service';

// presentation
import { AdminAuthController } from './presentation/controllers/admin-auth.controller';
import { AdminMeController } from './presentation/controllers/admin-me.controller';
import { AdminUsersController } from './presentation/controllers/admin-users.controller';
import { RolesController } from './presentation/controllers/roles.controller';
import { PermissionsController } from './presentation/controllers/permissions.controller';
import { AuditController } from './presentation/controllers/audit.controller';
import { AdminJwtStrategy } from './presentation/strategies/admin-jwt.strategy';
import { JwtAdminGuard } from './presentation/guards/jwt-admin.guard';
import { PermissionsGuard } from './presentation/guards/permissions.guard';
import { AdminSseAuthGuard } from './presentation/guards/admin-sse-auth.guard';
import { AdminDirectoryService } from './application/services/admin-directory.service';
import { AdminTokenVerifierService } from './application/services/admin-token-verifier.service';

@Module({
  imports: [
    ConfigModule,
    PassportModule,
    forwardRef(() => NotificationsModule),
    TypeOrmModule.forFeature([
      AdminUserOrmEntity,
      RoleOrmEntity,
      PermissionOrmEntity,
      RolePermissionOrmEntity,
      AdminSessionOrmEntity,
      AuditEntryOrmEntity,
      TwofaChallengeOrmEntity,
      PasswordResetTokenOrmEntity,
    ]),
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: requireEnv(config, 'JWT_ACCESS_SECRET'),
      }),
    }),
  ],
  controllers: [
    AdminAuthController,
    AdminMeController,
    AdminUsersController,
    RolesController,
    PermissionsController,
    AuditController,
  ],
  providers: [
    rbacConfigProvider,
    { provide: ADMIN_USER_REPOSITORY, useClass: TypeOrmAdminUserRepository },
    { provide: ROLE_REPOSITORY, useClass: TypeOrmRoleRepository },
    { provide: ADMIN_SESSION_REPOSITORY, useClass: TypeOrmAdminSessionRepository },
    { provide: TWOFA_CHALLENGE_REPOSITORY, useClass: TypeOrmTwofaChallengeRepository },
    { provide: PASSWORD_RESET_TOKEN_REPOSITORY, useClass: TypeOrmPasswordResetTokenRepository },
    { provide: AUDIT_REPOSITORY, useClass: TypeOrmAuditRepository },
    { provide: PASSWORD_HASHER, useClass: BcryptPasswordHasher },
    { provide: ADMIN_TOKEN_SERVICE, useClass: AdminJwtTokenService },
    { provide: ADMIN_OTP_SERVICE, useClass: AdminOtpService },
    { provide: ADMIN_NOTIFICATION_DISPATCHER, useClass: NotifAdminNotificationService },
    PermissionService,
    AuditService,
    SessionIssuerService,
    AdminLoginUseCase,
    Verify2faUseCase,
    RefreshAdminTokenUseCase,
    AdminLogoutUseCase,
    ForgotPasswordUseCase,
    ResetPasswordUseCase,
    GetAdminMeUseCase,
    UpdateAdminProfileUseCase,
    ChangeAdminPasswordUseCase,
    UpdateAdmin2faUseCase,
    AdminUserPolicyService,
    ListAdminUsersUseCase,
    InviteAdminUserUseCase,
    UpdateAdminUserUseCase,
    SuspendAdminUserUseCase,
    ReactivateAdminUserUseCase,
    DeleteAdminUserUseCase,
    ResendInviteUseCase,
    ListRolesUseCase,
    GetRoleUseCase,
    CreateRoleUseCase,
    UpdateRoleUseCase,
    DeleteRoleUseCase,
    ListAuditUseCase,
    AdminJwtStrategy,
    JwtAdminGuard,
    PermissionsGuard,
    AdminSseAuthGuard,
    AdminDirectoryService,
    AdminTokenVerifierService,
  ],
  // Exported so every other admin module reuses the same admin auth + permission gate.
  // AdminDirectoryService + AdminTokenVerifierService back NOTIF's in-app feed (recipient resolution +
  // SSE token auth). The verifier MUST be exported: AdminSseAuthGuard is instantiated in NOTIF's module
  // context (it's applied there via @UseGuards), so its only dependency has to resolve from RBAC's exports.
  exports: [
    JwtAdminGuard,
    PermissionsGuard,
    AdminSseAuthGuard,
    AdminDirectoryService,
    AdminTokenVerifierService,
    PermissionService,
    AuditService,
    PassportModule,
  ],
})
export class RbacModule {}
