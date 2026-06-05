import { Inject, Injectable } from '@nestjs/common';

import {
  ISessionRepository,
  SESSION_REPOSITORY,
} from '../../domain/repositories/session.repository.interface';

export interface LogoutAllCommand {
  customerId: string;
}

@Injectable()
export class LogoutAllUseCase {
  constructor(@Inject(SESSION_REPOSITORY) private readonly sessions: ISessionRepository) {}

  /** Revoke every refresh token for the customer (FR-AUTH-015). */
  async execute(command: LogoutAllCommand): Promise<void> {
    await this.sessions.revokeAllForCustomer(command.customerId, new Date());
  }
}
