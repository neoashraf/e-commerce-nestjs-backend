import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { TypeOrmModule } from '@nestjs/typeorm';

import { CartModule } from '../cart/cart.module';
// domain tokens
import { CUSTOMER_REPOSITORY } from './domain/repositories/customer.repository.interface';
import { OTP_CHALLENGE_REPOSITORY } from './domain/repositories/otp-challenge.repository.interface';
import { SESSION_REPOSITORY } from './domain/repositories/session.repository.interface';
import { EMAIL_VERIFICATION_TOKEN_REPOSITORY } from './domain/repositories/email-verification-token.repository.interface';
import { PASSWORD_RESET_TOKEN_REPOSITORY } from './domain/repositories/password-reset-token.repository.interface';
import { ADDRESS_REPOSITORY } from './domain/repositories/address.repository.interface';
// application
import { AUTH_CONFIG } from './application/ports/auth-config.port';
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
import { VerifyEmailUseCase } from './application/use-cases/verify-email.use-case';
import { IssueEmailVerificationUseCase } from './application/use-cases/issue-email-verification.use-case';
import { CreateLightweightAccountUseCase } from './application/use-cases/create-lightweight-account.use-case';
import { RequestPasswordResetUseCase } from './application/use-cases/request-password-reset.use-case';
import { ResetPasswordUseCase } from './application/use-cases/reset-password.use-case';
import { GetMeUseCase } from './application/use-cases/get-me.use-case';
import { UpdateProfileUseCase } from './application/use-cases/update-profile.use-case';
import { ChangePasswordUseCase } from './application/use-cases/change-password.use-case';
import { RequestPhoneChangeUseCase } from './application/use-cases/request-phone-change.use-case';
import { ConfirmPhoneChangeUseCase } from './application/use-cases/confirm-phone-change.use-case';
import { DeleteAccountUseCase } from './application/use-cases/delete-account.use-case';
import { ClaimAccountUseCase } from './application/use-cases/claim-account.use-case';
import { ListAddressesUseCase } from './application/use-cases/list-addresses.use-case';
import { CreateAddressUseCase } from './application/use-cases/create-address.use-case';
import { UpdateAddressUseCase } from './application/use-cases/update-address.use-case';
import { DeleteAddressUseCase } from './application/use-cases/delete-address.use-case';
// infrastructure
import { CustomerOrmEntity } from './infrastructure/persistence/typeorm/entities/customer.orm-entity';
import { OtpChallengeOrmEntity } from './infrastructure/persistence/typeorm/entities/otp-challenge.orm-entity';
import { SessionOrmEntity } from './infrastructure/persistence/typeorm/entities/session.orm-entity';
import { EmailVerificationTokenOrmEntity } from './infrastructure/persistence/typeorm/entities/email-verification-token.orm-entity';
import { PasswordResetTokenOrmEntity } from './infrastructure/persistence/typeorm/entities/password-reset-token.orm-entity';
import { AddressOrmEntity } from './infrastructure/persistence/typeorm/entities/address.orm-entity';
import { TypeOrmCustomerRepository } from './infrastructure/persistence/typeorm/repositories/typeorm-customer.repository';
import { TypeOrmOtpChallengeRepository } from './infrastructure/persistence/typeorm/repositories/typeorm-otp-challenge.repository';
import { TypeOrmSessionRepository } from './infrastructure/persistence/typeorm/repositories/typeorm-session.repository';
import { TypeOrmEmailVerificationTokenRepository } from './infrastructure/persistence/typeorm/repositories/typeorm-email-verification-token.repository';
import { TypeOrmPasswordResetTokenRepository } from './infrastructure/persistence/typeorm/repositories/typeorm-password-reset-token.repository';
import { TypeOrmAddressRepository } from './infrastructure/persistence/typeorm/repositories/typeorm-address.repository';
import { JwtTokenService } from './infrastructure/services/jwt-token.service';
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
import { InternalCustomersController } from './presentation/controllers/internal-customers.controller';
import { ServiceTokenGuard } from '../../shared/guards/service-token.guard';
import { JwtCustomerStrategy } from './presentation/strategies/jwt-customer.strategy';
import { JwtCustomerGuard } from './presentation/guards/jwt-customer.guard';

@Module({
  imports: [
    ConfigModule,
    PassportModule,
    CartModule,
    TypeOrmModule.forFeature([
      CustomerOrmEntity,
      OtpChallengeOrmEntity,
      SessionOrmEntity,
      EmailVerificationTokenOrmEntity,
      PasswordResetTokenOrmEntity,
      AddressOrmEntity,
    ]),
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get<string>('JWT_ACCESS_SECRET') ?? 'dev-access-secret',
      }),
    }),
  ],
  controllers: [
    AuthController,
    MeController,
    MeSessionsController,
    MeAddressesController,
    InternalCustomersController,
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
    { provide: ADDRESS_REPOSITORY, useClass: TypeOrmAddressRepository },
    { provide: TOKEN_SERVICE, useClass: JwtTokenService },
    { provide: OTP_SERVICE, useClass: OtpService },
    { provide: NOTIFICATION_DISPATCHER, useClass: NotificationDispatcherService },
    { provide: PASSWORD_HASHER, useClass: BcryptPasswordHasher },
    { provide: VERIFICATION_TOKEN_SERVICE, useClass: VerificationTokenService },
    { provide: ZONE_RESOLVER, useClass: CartZoneResolverAdapter },
    RequestOtpUseCase,
    VerifyOtpUseCase,
    RefreshTokenUseCase,
    LogoutUseCase,
    LogoutAllUseCase,
    IssueEmailVerificationUseCase,
    RegisterWithEmailUseCase,
    LoginWithEmailUseCase,
    VerifyEmailUseCase,
    CreateLightweightAccountUseCase,
    RequestPasswordResetUseCase,
    ResetPasswordUseCase,
    GetMeUseCase,
    UpdateProfileUseCase,
    ChangePasswordUseCase,
    RequestPhoneChangeUseCase,
    ConfirmPhoneChangeUseCase,
    DeleteAccountUseCase,
    ClaimAccountUseCase,
    ListAddressesUseCase,
    CreateAddressUseCase,
    UpdateAddressUseCase,
    DeleteAddressUseCase,
    JwtCustomerStrategy,
    JwtCustomerGuard,
    ServiceTokenGuard,
  ],
  exports: [JwtCustomerGuard, PassportModule, IssueEmailVerificationUseCase],
})
export class AuthModule {}
