import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { TypeOrmModule } from '@nestjs/typeorm';

// domain tokens
import { CUSTOMER_REPOSITORY } from './domain/repositories/customer.repository.interface';
import { OTP_CHALLENGE_REPOSITORY } from './domain/repositories/otp-challenge.repository.interface';
import { SESSION_REPOSITORY } from './domain/repositories/session.repository.interface';
import { EMAIL_VERIFICATION_TOKEN_REPOSITORY } from './domain/repositories/email-verification-token.repository.interface';
// application
import { AUTH_CONFIG } from './application/ports/auth-config.port';
import { OTP_SERVICE } from './application/ports/otp-service.port';
import { TOKEN_SERVICE } from './application/ports/token-service.port';
import { NOTIFICATION_DISPATCHER } from './application/ports/notification-dispatcher.port';
import { PASSWORD_HASHER } from './application/ports/password-hasher.port';
import { VERIFICATION_TOKEN_SERVICE } from './application/ports/verification-token.port';
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
// infrastructure
import { CustomerOrmEntity } from './infrastructure/persistence/typeorm/entities/customer.orm-entity';
import { OtpChallengeOrmEntity } from './infrastructure/persistence/typeorm/entities/otp-challenge.orm-entity';
import { SessionOrmEntity } from './infrastructure/persistence/typeorm/entities/session.orm-entity';
import { EmailVerificationTokenOrmEntity } from './infrastructure/persistence/typeorm/entities/email-verification-token.orm-entity';
import { TypeOrmCustomerRepository } from './infrastructure/persistence/typeorm/repositories/typeorm-customer.repository';
import { TypeOrmOtpChallengeRepository } from './infrastructure/persistence/typeorm/repositories/typeorm-otp-challenge.repository';
import { TypeOrmSessionRepository } from './infrastructure/persistence/typeorm/repositories/typeorm-session.repository';
import { TypeOrmEmailVerificationTokenRepository } from './infrastructure/persistence/typeorm/repositories/typeorm-email-verification-token.repository';
import { JwtTokenService } from './infrastructure/services/jwt-token.service';
import { OtpService } from './infrastructure/services/otp.service';
import { NotificationDispatcherService } from './infrastructure/services/notification-dispatcher.service';
import { BcryptPasswordHasher } from './infrastructure/services/bcrypt-password-hasher.service';
import { VerificationTokenService } from './infrastructure/services/verification-token.service';
import { authConfigProvider } from './infrastructure/config/auth-config.provider';
// presentation
import { AuthController } from './presentation/controllers/auth.controller';
import { MeSessionsController } from './presentation/controllers/me-sessions.controller';
import { InternalCustomersController } from './presentation/controllers/internal-customers.controller';
import { ServiceTokenGuard } from '../../shared/guards/service-token.guard';
import { JwtCustomerStrategy } from './presentation/strategies/jwt-customer.strategy';
import { JwtCustomerGuard } from './presentation/guards/jwt-customer.guard';

@Module({
  imports: [
    ConfigModule,
    PassportModule,
    TypeOrmModule.forFeature([
      CustomerOrmEntity,
      OtpChallengeOrmEntity,
      SessionOrmEntity,
      EmailVerificationTokenOrmEntity,
    ]),
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get<string>('JWT_ACCESS_SECRET') ?? 'dev-access-secret',
      }),
    }),
  ],
  controllers: [AuthController, MeSessionsController, InternalCustomersController],
  providers: [
    authConfigProvider,
    { provide: CUSTOMER_REPOSITORY, useClass: TypeOrmCustomerRepository },
    { provide: OTP_CHALLENGE_REPOSITORY, useClass: TypeOrmOtpChallengeRepository },
    { provide: SESSION_REPOSITORY, useClass: TypeOrmSessionRepository },
    {
      provide: EMAIL_VERIFICATION_TOKEN_REPOSITORY,
      useClass: TypeOrmEmailVerificationTokenRepository,
    },
    { provide: TOKEN_SERVICE, useClass: JwtTokenService },
    { provide: OTP_SERVICE, useClass: OtpService },
    { provide: NOTIFICATION_DISPATCHER, useClass: NotificationDispatcherService },
    { provide: PASSWORD_HASHER, useClass: BcryptPasswordHasher },
    { provide: VERIFICATION_TOKEN_SERVICE, useClass: VerificationTokenService },
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
    JwtCustomerStrategy,
    JwtCustomerGuard,
    ServiceTokenGuard,
  ],
  exports: [JwtCustomerGuard, PassportModule, IssueEmailVerificationUseCase],
})
export class AuthModule {}
