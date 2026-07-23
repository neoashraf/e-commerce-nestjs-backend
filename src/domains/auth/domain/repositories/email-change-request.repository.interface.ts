import { EmailChangeRequest } from '../entities/email-change-request.entity';

export interface IEmailChangeRequestRepository {
  findById(id: string): Promise<EmailChangeRequest | null>;
  /** Most recently created request for a customer (for the request cooldown). */
  findLatestByCustomer(customerId: string): Promise<EmailChangeRequest | null>;
  /** Consume all outstanding (unconsumed) requests for a customer when a new one is issued. */
  consumeOutstandingForCustomer(customerId: string, now: Date): Promise<void>;
  save(request: EmailChangeRequest): Promise<EmailChangeRequest>;
}

export const EMAIL_CHANGE_REQUEST_REPOSITORY = Symbol('IEmailChangeRequestRepository');
