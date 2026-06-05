import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { TypeOrmModule } from '@nestjs/typeorm';

// domain tokens
import { CUSTOMER_REPOSITORY } from './domain/repositories/customer.repository.interface';
import { OTP_CHALLENGE_REPOSITORY } from './domain/repositories/otp-challenge.repository.interface';
import { SESSION_REPOSITORY } from './domain/repositories/session.repository.interface';
// application
import { AUTH_CONFIG } from './application/ports/auth-config.port';
import { OTP_SERVICE } from './application/ports/otp-service.port';
import { TOKEN_SERVICE } from './application/ports/token-service.port';
import { NOTIFICATION_DISPATCHER } from './application/ports/notification-dispatcher.port';
import { RequestOtpUseCase } from './application/use-cases/request-otp.use-case';
import { VerifyOtpUseCase } from './application/use-cases/verify-otp.use-case';
import { RefreshTokenUseCase } from './application/use-cases/refresh-token.use-case';
import { LogoutUseCase } from './application/use-cases/logout.use-case';
import { LogoutAllUseCase } from './application/use-cases/logout-all.use-case';
// infrastructure
import { CustomerOrmEntity } from './infrastructure/persistence/typeorm/entities/customer.orm-entity';
import { OtpChallengeOrmEntity } from './infrastructure/persistence/typeorm/entities/otp-challenge.orm-entity';
import { SessionOrmEntity } from './infrastructure/persistence/typeorm/entities/session.orm-entity';
import { TypeOrmCustomerRepository } from './infrastructure/persistence/typeorm/repositories/typeorm-customer.repository';
import { TypeOrmOtpChallengeRepository } from './infrastructure/persistence/typeorm/repositories/typeorm-otp-challenge.repository';
import { TypeOrmSessionRepository } from './infrastructure/persistence/typeorm/repositories/typeorm-session.repository';
import { JwtTokenService } from './infrastructure/services/jwt-token.service';
import { OtpService } from './infrastructure/services/otp.service';
import { NotificationDispatcherService } from './infrastructure/services/notification-dispatcher.service';
import { authConfigProvider } from './infrastructure/config/auth-config.provider';
// presentation
import { AuthController } from './presentation/controllers/auth.controller';
import { MeSessionsController } from './presentation/controllers/me-sessions.controller';
import { JwtCustomerStrategy } from './presentation/strategies/jwt-customer.strategy';
import { JwtCustomerGuard } from './presentation/guards/jwt-customer.guard';

@Module({
  imports: [
    ConfigModule,
    PassportModule,
    TypeOrmModule.forFeature([CustomerOrmEntity, OtpChallengeOrmEntity, SessionOrmEntity]),
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get<string>('JWT_ACCESS_SECRET') ?? 'dev-access-secret',
      }),
    }),
  ],
  controllers: [AuthController, MeSessionsController],
  providers: [
    authConfigProvider,
    { provide: CUSTOMER_REPOSITORY, useClass: TypeOrmCustomerRepository },
    { provide: OTP_CHALLENGE_REPOSITORY, useClass: TypeOrmOtpChallengeRepository },
    { provide: SESSION_REPOSITORY, useClass: TypeOrmSessionRepository },
    { provide: TOKEN_SERVICE, useClass: JwtTokenService },
    { provide: OTP_SERVICE, useClass: OtpService },
    { provide: NOTIFICATION_DISPATCHER, useClass: NotificationDispatcherService },
    RequestOtpUseCase,
    VerifyOtpUseCase,
    RefreshTokenUseCase,
    LogoutUseCase,
    LogoutAllUseCase,
    JwtCustomerStrategy,
    JwtCustomerGuard,
  ],
  exports: [JwtCustomerGuard, PassportModule],
})
export class AuthModule {}
