import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { TypeOrmModule } from '@nestjs/typeorm';

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
import { AdminJwtStrategy } from './presentation/strategies/admin-jwt.strategy';
import { JwtAdminGuard } from './presentation/guards/jwt-admin.guard';
import { PermissionsGuard } from './presentation/guards/permissions.guard';

@Module({
  imports: [
    ConfigModule,
    PassportModule,
    NotificationsModule,
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
        secret: config.get<string>('JWT_ACCESS_SECRET') ?? 'dev-access-secret',
      }),
    }),
  ],
  controllers: [AdminAuthController, AdminMeController],
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
    AdminJwtStrategy,
    JwtAdminGuard,
    PermissionsGuard,
  ],
  // Exported so every other admin module reuses the same admin auth + permission gate.
  exports: [JwtAdminGuard, PermissionsGuard, PermissionService, AuditService, PassportModule],
})
export class RbacModule {}
