import { forwardRef, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { TypeOrmModule } from '@nestjs/typeorm';

import { requireEnv } from '../../shared/config/require-env';
import { CartModule } from '../cart/cart.module';
// domain tokens
import { CUSTOMER_REPOSITORY } from './domain/repositories/customer.repository.interface';
import { OTP_CHALLENGE_REPOSITORY } from './domain/repositories/otp-challenge.repository.interface';
import { SESSION_REPOSITORY } from './domain/repositories/session.repository.interface';
import { EMAIL_VERIFICATION_TOKEN_REPOSITORY } from './domain/repositories/email-verification-token.repository.interface';
import { PASSWORD_RESET_TOKEN_REPOSITORY } from './domain/repositories/password-reset-token.repository.interface';
import { PASSWORD_SET_TOKEN_REPOSITORY } from './domain/repositories/password-set-token.repository.interface';
import { EMAIL_CHANGE_REQUEST_REPOSITORY } from './domain/repositories/email-change-request.repository.interface';
import { ADDRESS_REPOSITORY } from './domain/repositories/address.repository.interface';
// application
import { AUTH_CONFIG } from './application/ports/auth-config.port';
import { GOOGLE_VERIFIER } from './application/ports/google-verifier.port';
import { GUEST_ORDER_CLAIM_PORT } from './application/ports/guest-order-claim.port';
import { OTP_SERVICE } from './application/ports/otp-service.port';
import { TOKEN_SERVICE } from './application/ports/token-service.port';
import { NOTIFICATION_DISPATCHER } from './application/ports/notification-dispatcher.port';
import { PASSWORD_HASHER } from './application/ports/password-hasher.port';
import { VERIFICATION_TOKEN_SERVICE } from './application/ports/verification-token.port';
import { ZONE_RESOLVER } from './application/ports/zone-resolver.port';
import { RequestOtpUseCase } from './application/use-cases/request-otp.use-case';
import { VerifyOtpUseCase } from './application/use-cases/verify-otp.use-case';
import { RefreshTokenUseCase } from './application/use-cases/refresh-token.use-case';
import { LogoutUseCase } from './application/use-cases/logout.use-case';
import { LogoutAllUseCase } from './application/use-cases/logout-all.use-case';
import { RegisterWithEmailUseCase } from './application/use-cases/register-with-email.use-case';
import { LoginWithEmailUseCase } from './application/use-cases/login-with-email.use-case';
import { LoginWithGoogleUseCase } from './application/use-cases/login-with-google.use-case';
import { VerifyEmailUseCase } from './application/use-cases/verify-email.use-case';
import { IssueEmailVerificationUseCase } from './application/use-cases/issue-email-verification.use-case';
import { RequestPasswordResetUseCase } from './application/use-cases/request-password-reset.use-case';
import { ResetPasswordUseCase } from './application/use-cases/reset-password.use-case';
import { GetMeUseCase } from './application/use-cases/get-me.use-case';
import { UpdateProfileUseCase } from './application/use-cases/update-profile.use-case';
import { ChangePasswordUseCase } from './application/use-cases/change-password.use-case';
import { RequestPasswordSetUseCase } from './application/use-cases/request-password-set.use-case';
import { SetPasswordUseCase } from './application/use-cases/set-password.use-case';
import { RequestEmailChangeUseCase } from './application/use-cases/request-email-change.use-case';
import { ConfirmEmailChangeUseCase } from './application/use-cases/confirm-email-change.use-case';
import { UnverifiedEmailReleaseTask } from './application/unverified-email-release.task';
import { RequestPhoneChangeUseCase } from './application/use-cases/request-phone-change.use-case';
import { ConfirmPhoneChangeUseCase } from './application/use-cases/confirm-phone-change.use-case';
import { DeleteAccountUseCase } from './application/use-cases/delete-account.use-case';
import { ListAddressesUseCase } from './application/use-cases/list-addresses.use-case';
import { GetAddressUseCase } from './application/use-cases/get-address.use-case';
import { CreateAddressUseCase } from './application/use-cases/create-address.use-case';
import { UpdateAddressUseCase } from './application/use-cases/update-address.use-case';
import { DeleteAddressUseCase } from './application/use-cases/delete-address.use-case';
// infrastructure
import { CustomerOrmEntity } from './infrastructure/persistence/typeorm/entities/customer.orm-entity';
import { OtpChallengeOrmEntity } from './infrastructure/persistence/typeorm/entities/otp-challenge.orm-entity';
import { SessionOrmEntity } from './infrastructure/persistence/typeorm/entities/session.orm-entity';
import { EmailVerificationTokenOrmEntity } from './infrastructure/persistence/typeorm/entities/email-verification-token.orm-entity';
import { PasswordResetTokenOrmEntity } from './infrastructure/persistence/typeorm/entities/password-reset-token.orm-entity';
import { PasswordSetTokenOrmEntity } from './infrastructure/persistence/typeorm/entities/password-set-token.orm-entity';
import { EmailChangeRequestOrmEntity } from './infrastructure/persistence/typeorm/entities/email-change-request.orm-entity';
import { AddressOrmEntity } from './infrastructure/persistence/typeorm/entities/address.orm-entity';
import { OrderOrmEntity } from '../orders/infrastructure/persistence/typeorm/entities/order.orm-entity';
import { GuestOrderClaimAdapter } from './infrastructure/adapters/guest-order-claim.adapter';
import { TypeOrmCustomerRepository } from './infrastructure/persistence/typeorm/repositories/typeorm-customer.repository';
import { TypeOrmOtpChallengeRepository } from './infrastructure/persistence/typeorm/repositories/typeorm-otp-challenge.repository';
import { TypeOrmSessionRepository } from './infrastructure/persistence/typeorm/repositories/typeorm-session.repository';
import { TypeOrmEmailVerificationTokenRepository } from './infrastructure/persistence/typeorm/repositories/typeorm-email-verification-token.repository';
import { TypeOrmPasswordResetTokenRepository } from './infrastructure/persistence/typeorm/repositories/typeorm-password-reset-token.repository';
import { TypeOrmPasswordSetTokenRepository } from './infrastructure/persistence/typeorm/repositories/typeorm-password-set-token.repository';
import { TypeOrmEmailChangeRequestRepository } from './infrastructure/persistence/typeorm/repositories/typeorm-email-change-request.repository';
import { TypeOrmAddressRepository } from './infrastructure/persistence/typeorm/repositories/typeorm-address.repository';
import { JwtTokenService } from './infrastructure/services/jwt-token.service';
import { GoogleTokenInfoVerifier } from './infrastructure/services/google-tokeninfo.verifier';
import { OtpService } from './infrastructure/services/otp.service';
import { NotificationDispatcherService } from './infrastructure/services/notification-dispatcher.service';
import { BcryptPasswordHasher } from './infrastructure/services/bcrypt-password-hasher.service';
import { VerificationTokenService } from './infrastructure/services/verification-token.service';
import { CartZoneResolverAdapter } from './infrastructure/services/cart-zone-resolver.adapter';
import { authConfigProvider } from './infrastructure/config/auth-config.provider';
// presentation
import { AuthController } from './presentation/controllers/auth.controller';
import { MeController } from './presentation/controllers/me.controller';
import { MeSessionsController } from './presentation/controllers/me-sessions.controller';
import { MeAddressesController } from './presentation/controllers/me-addresses.controller';
import { ServiceTokenGuard } from '../../shared/guards/service-token.guard';
import { JwtCustomerStrategy } from './presentation/strategies/jwt-customer.strategy';
import { JwtCustomerGuard } from './presentation/guards/jwt-customer.guard';
// MFA (module 17) — configurable customer 2FA, registered here so it reuses AUTH's customer/otp/
// token/session/notification providers and can gate email+password login (no cross-module cycle).
import { RbacModule } from '../rbac/rbac.module';
import { MFA_SETTINGS_REPOSITORY } from '../mfa/domain/repositories/mfa-settings.repository.interface';
import { CUSTOMER_MFA_REPOSITORY } from '../mfa/domain/repositories/customer-mfa.repository.interface';
import { MFA_CHALLENGE_REPOSITORY } from '../mfa/domain/repositories/mfa-challenge.repository.interface';
import { MFA_PRE_AUTH_REPOSITORY } from '../mfa/domain/repositories/mfa-pre-auth.repository.interface';
import { MfaSettingsOrmEntity } from '../mfa/infrastructure/persistence/typeorm/entities/mfa-settings.orm-entity';
import { CustomerMfaOrmEntity } from '../mfa/infrastructure/persistence/typeorm/entities/customer-mfa.orm-entity';
import { MfaChallengeOrmEntity } from '../mfa/infrastructure/persistence/typeorm/entities/mfa-challenge.orm-entity';
import { MfaPreAuthOrmEntity } from '../mfa/infrastructure/persistence/typeorm/entities/mfa-pre-auth.orm-entity';
import { TypeOrmMfaSettingsRepository } from '../mfa/infrastructure/persistence/typeorm/repositories/typeorm-mfa-settings.repository';
import { TypeOrmCustomerMfaRepository } from '../mfa/infrastructure/persistence/typeorm/repositories/typeorm-customer-mfa.repository';
import { TypeOrmMfaChallengeRepository } from '../mfa/infrastructure/persistence/typeorm/repositories/typeorm-mfa-challenge.repository';
import { TypeOrmMfaPreAuthRepository } from '../mfa/infrastructure/persistence/typeorm/repositories/typeorm-mfa-pre-auth.repository';
import { mfaConfigProvider } from '../mfa/infrastructure/config/mfa-config.provider';
import { MfaChallengeIssuer } from '../mfa/application/services/mfa-challenge-issuer.service';
import { MfaLoginGateService } from '../mfa/application/services/mfa-login-gate.service';
import { VerifySecondFactorUseCase } from '../mfa/application/use-cases/verify-second-factor.use-case';
import { ResendSecondFactorUseCase } from '../mfa/application/use-cases/resend-second-factor.use-case';
import { SwitchChannelUseCase } from '../mfa/application/use-cases/switch-channel.use-case';
import { GetMyMfaUseCase } from '../mfa/application/use-cases/get-my-mfa.use-case';
import { EnableMfaUseCase } from '../mfa/application/use-cases/enable-mfa.use-case';
import { ConfirmEnableUseCase } from '../mfa/application/use-cases/confirm-enable.use-case';
import { DisableMfaUseCase } from '../mfa/application/use-cases/disable-mfa.use-case';
import { SetPreferredChannelUseCase } from '../mfa/application/use-cases/set-preferred-channel.use-case';
import { GetMfaPolicyUseCase } from '../mfa/application/use-cases/get-mfa-policy.use-case';
import { UpdateMfaPolicyUseCase } from '../mfa/application/use-cases/update-mfa-policy.use-case';
import { MfaAuthController } from '../mfa/presentation/controllers/mfa-auth.controller';
import { MeMfaController } from '../mfa/presentation/controllers/me-mfa.controller';
import { AdminMfaController } from '../mfa/presentation/controllers/admin-mfa.controller';

@Module({
  imports: [
    ConfigModule,
    PassportModule,
    forwardRef(() => CartModule),
    // RBAC exports the admin guards + AuditService the admin MFA-policy controller needs.
    RbacModule,
    TypeOrmModule.forFeature([
      CustomerOrmEntity,
      OtpChallengeOrmEntity,
      SessionOrmEntity,
      EmailVerificationTokenOrmEntity,
      PasswordResetTokenOrmEntity,
      PasswordSetTokenOrmEntity,
      EmailChangeRequestOrmEntity,
      AddressOrmEntity,
      // Read/write access to ORD's orders table so AUTH can claim a phone's guest orders on OTP
      // verification (guest-order-claim adapter). forFeature only registers the repository here.
      OrderOrmEntity,
      // MFA (module 17) tables.
      MfaSettingsOrmEntity,
      CustomerMfaOrmEntity,
      MfaChallengeOrmEntity,
      MfaPreAuthOrmEntity,
    ]),
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: requireEnv(config, 'JWT_ACCESS_SECRET'),
      }),
    }),
  ],
  controllers: [
    AuthController,
    MeController,
    MeSessionsController,
    MeAddressesController,
    // MFA (module 17)
    MfaAuthController,
    MeMfaController,
    AdminMfaController,
  ],
  providers: [
    authConfigProvider,
    { provide: CUSTOMER_REPOSITORY, useClass: TypeOrmCustomerRepository },
    { provide: OTP_CHALLENGE_REPOSITORY, useClass: TypeOrmOtpChallengeRepository },
    { provide: SESSION_REPOSITORY, useClass: TypeOrmSessionRepository },
    {
      provide: EMAIL_VERIFICATION_TOKEN_REPOSITORY,
      useClass: TypeOrmEmailVerificationTokenRepository,
    },
    {
      provide: PASSWORD_RESET_TOKEN_REPOSITORY,
      useClass: TypeOrmPasswordResetTokenRepository,
    },
    {
      provide: PASSWORD_SET_TOKEN_REPOSITORY,
      useClass: TypeOrmPasswordSetTokenRepository,
    },
    {
      provide: EMAIL_CHANGE_REQUEST_REPOSITORY,
      useClass: TypeOrmEmailChangeRequestRepository,
    },
    { provide: ADDRESS_REPOSITORY, useClass: TypeOrmAddressRepository },
    { provide: TOKEN_SERVICE, useClass: JwtTokenService },
    { provide: GOOGLE_VERIFIER, useClass: GoogleTokenInfoVerifier },
    { provide: OTP_SERVICE, useClass: OtpService },
    { provide: NOTIFICATION_DISPATCHER, useClass: NotificationDispatcherService },
    { provide: PASSWORD_HASHER, useClass: BcryptPasswordHasher },
    { provide: VERIFICATION_TOKEN_SERVICE, useClass: VerificationTokenService },
    { provide: ZONE_RESOLVER, useClass: CartZoneResolverAdapter },
    { provide: GUEST_ORDER_CLAIM_PORT, useClass: GuestOrderClaimAdapter },
    RequestOtpUseCase,
    VerifyOtpUseCase,
    RefreshTokenUseCase,
    LogoutUseCase,
    LogoutAllUseCase,
    IssueEmailVerificationUseCase,
    RegisterWithEmailUseCase,
    LoginWithEmailUseCase,
    LoginWithGoogleUseCase,
    VerifyEmailUseCase,
    RequestPasswordResetUseCase,
    ResetPasswordUseCase,
    GetMeUseCase,
    UpdateProfileUseCase,
    ChangePasswordUseCase,
    RequestPasswordSetUseCase,
    SetPasswordUseCase,
    RequestEmailChangeUseCase,
    ConfirmEmailChangeUseCase,
    UnverifiedEmailReleaseTask,
    RequestPhoneChangeUseCase,
    ConfirmPhoneChangeUseCase,
    DeleteAccountUseCase,
    ListAddressesUseCase,
    GetAddressUseCase,
    CreateAddressUseCase,
    UpdateAddressUseCase,
    DeleteAddressUseCase,
    JwtCustomerStrategy,
    JwtCustomerGuard,
    ServiceTokenGuard,
    // MFA (module 17) — repositories, config, services, use-cases.
    { provide: MFA_SETTINGS_REPOSITORY, useClass: TypeOrmMfaSettingsRepository },
    { provide: CUSTOMER_MFA_REPOSITORY, useClass: TypeOrmCustomerMfaRepository },
    { provide: MFA_CHALLENGE_REPOSITORY, useClass: TypeOrmMfaChallengeRepository },
    { provide: MFA_PRE_AUTH_REPOSITORY, useClass: TypeOrmMfaPreAuthRepository },
    mfaConfigProvider,
    MfaChallengeIssuer,
    MfaLoginGateService,
    VerifySecondFactorUseCase,
    ResendSecondFactorUseCase,
    SwitchChannelUseCase,
    GetMyMfaUseCase,
    EnableMfaUseCase,
    ConfirmEnableUseCase,
    DisableMfaUseCase,
    SetPreferredChannelUseCase,
    GetMfaPolicyUseCase,
    UpdateMfaPolicyUseCase,
  ],
  exports: [
    JwtCustomerGuard,
    PassportModule,
    IssueEmailVerificationUseCase,
    GetAddressUseCase,
  ],
})
export class AuthModule {}
